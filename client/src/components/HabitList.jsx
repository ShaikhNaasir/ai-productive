import { useEffect, useState, useCallback } from 'react';
import { Plus, Trash2, Flame, Check } from 'lucide-react';
import { habitService } from '@/services/habitService';
import { apiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export default function HabitList() {
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setHabits(await habitService.list());
    } catch (err) {
      setError(apiError(err, 'Failed to load habits'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addHabit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await habitService.create({ name });
      setName('');
      load();
    } catch (err) {
      setError(apiError(err, 'Failed to create habit'));
    }
  };

  // Optimistically swap the returned habit into the list after a check-in toggle.
  const replace = (updated) => setHabits((hs) => hs.map((h) => (h.id === updated.id ? updated : h)));

  const toggle = async (habit) => {
    try {
      const updated = habit.checkedInToday
        ? await habitService.uncheck(habit.id)
        : await habitService.checkIn(habit.id);
      replace(updated);
    } catch (err) {
      setError(apiError(err, 'Failed to update check-in'));
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this habit?')) return;
    try {
      await habitService.remove(id);
      setHabits((hs) => hs.filter((h) => h.id !== id));
    } catch (err) {
      setError(apiError(err, 'Failed to delete habit'));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New habit</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addHabit} className="flex flex-col gap-2 sm:flex-row">
            <Input
              placeholder="e.g. Read 20 minutes"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1"
              aria-label="Habit name"
            />
            <Button type="submit">
              <Plus className="h-4 w-4" /> Add
            </Button>
          </form>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : habits.length === 0 ? (
        <p className="text-sm text-muted-foreground">No habits yet. Add one above.</p>
      ) : (
        <ul className="space-y-2">
          {habits.map((habit) => (
            <li key={habit.id} className="task-card flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{habit.name}</span>
                  <Badge variant="secondary">
                    <Flame className="mr-1 h-3 w-3" />
                    {habit.currentStreak} day{habit.currentStreak === 1 ? '' : 's'}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Longest {habit.longestStreak} · {habit.totalCheckIns} check-ins
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant={habit.checkedInToday ? 'default' : 'outline'}
                  onClick={() => toggle(habit)}
                  aria-label={habit.checkedInToday ? 'Undo today' : 'Check in today'}
                  aria-pressed={habit.checkedInToday}
                >
                  <Check className={cn('h-4 w-4', habit.checkedInToday && 'opacity-100')} />
                  {habit.checkedInToday ? 'Done today' : 'Check in'}
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove(habit.id)} aria-label="Delete">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
