import { useEffect, useState, useCallback } from 'react';
import { Plus } from 'lucide-react';
import { calendarService, scheduleService, reminderService } from '@/services/calendarService';
import { apiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';

const typeVariant = { task: 'medium', schedule: 'default', reminder: 'secondary' };
const RECURRENCES = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'];

function groupByDay(events) {
  const groups = {};
  for (const e of events) {
    const day = new Date(e.date).toDateString();
    (groups[day] = groups[day] || []).push(e);
  }
  return groups;
}

export default function Calendar() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ title: '', startTime: '' });
  const [reminder, setReminder] = useState({ message: '', remindAt: '', recurrence: 'NONE' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setEvents(await calendarService.events());
    } catch (err) {
      setError(apiError(err, 'Failed to load calendar'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const addSchedule = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.startTime) return;
    try {
      await scheduleService.create({ title: form.title, startTime: new Date(form.startTime).toISOString() });
      setForm({ title: '', startTime: '' });
      load();
    } catch (err) {
      setError(apiError(err, 'Failed to add event'));
    }
  };

  const addReminder = async (e) => {
    e.preventDefault();
    if (!reminder.message.trim() || !reminder.remindAt) return;
    try {
      const payload = { message: reminder.message, remindAt: new Date(reminder.remindAt).toISOString() };
      if (reminder.recurrence !== 'NONE') payload.recurrence = reminder.recurrence;
      await reminderService.create(payload);
      setReminder({ message: '', remindAt: '', recurrence: 'NONE' });
      load();
    } catch (err) {
      setError(apiError(err, 'Failed to add reminder'));
    }
  };

  const groups = groupByDay(events);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add event</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addSchedule} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="event-title">Title</Label>
              <Input
                id="event-title"
                placeholder="e.g. Team standup"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="h-11 text-base"
              />
            </div>
            <div className="space-y-1.5 sm:max-w-xs">
              <Label htmlFor="event-time">Date &amp; time</Label>
              <Input
                id="event-time"
                type="datetime-local"
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className="h-11 text-base"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="lg">
                <Plus className="h-4 w-4" /> Add event
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add reminder</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addReminder} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reminder-message">Reminder</Label>
              <Input
                id="reminder-message"
                placeholder="e.g. Call the dentist"
                value={reminder.message}
                onChange={(e) => setReminder({ ...reminder, message: e.target.value })}
                className="h-11 text-base"
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="reminder-time">Remind at</Label>
                <Input
                  id="reminder-time"
                  type="datetime-local"
                  value={reminder.remindAt}
                  onChange={(e) => setReminder({ ...reminder, remindAt: e.target.value })}
                  className="h-11 text-base"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reminder-repeat">Repeat</Label>
                <select
                  id="reminder-repeat"
                  value={reminder.recurrence}
                  onChange={(e) => setReminder({ ...reminder, recurrence: e.target.value })}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {RECURRENCES.map((r) => (
                    <option key={r} value={r}>
                      {r === 'NONE' ? 'No repeat' : r}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="secondary" size="lg">
                <Plus className="h-4 w-4" /> Add reminder
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing scheduled. Add an event, task deadline, or reminder.</p>
      ) : (
        <div className="space-y-4">
          {Object.entries(groups).map(([day, dayEvents]) => (
            <Card key={day}>
              <CardHeader>
                <CardTitle className="text-base">{day}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {dayEvents.map((e) => (
                  <div key={`${e.type}-${e.id}`} className="flex items-center justify-between border-b pb-2 last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={typeVariant[e.type]}>{e.type}</Badge>
                      <span className="text-sm">{e.title}</span>
                      {e.type === 'schedule' && e.meta?.googleEventId && (
                        <Badge variant="outline">Synced</Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {/* All-day events have no meaningful clock time — showing one
                          (e.g. midnight rendered in local tz) is misleading. */}
                      {formatDate(e.date, { withTime: !(e.type === 'schedule' && e.meta?.allDay) })}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
