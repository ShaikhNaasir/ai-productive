import { useEffect, useState, useCallback } from 'react';
import { Trash2, Check, Plus, Sparkles } from 'lucide-react';
import { taskService } from '@/services/taskService';
import { aiService } from '@/services/aiService';
import { apiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn, formatDate } from '@/lib/utils';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
const STATUSES = ['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED'];

function priorityVariant(p) {
  return { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' }[p] || 'secondary';
}

export default function TaskList() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [form, setForm] = useState({ title: '', priority: 'MEDIUM', dueDate: '' });
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = filter === 'ALL' ? {} : { status: filter };
      setTasks(await taskService.list(params));
    } catch (err) {
      setError(apiError(err, 'Failed to load tasks'));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const addTask = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      const payload = { title: form.title, priority: form.priority };
      if (form.dueDate) payload.dueDate = form.dueDate;
      await taskService.create(payload);
      setForm({ title: '', priority: 'MEDIUM', dueDate: '' });
      load();
    } catch (err) {
      setError(apiError(err, 'Failed to create task'));
    }
  };

  const aiAdd = async (e) => {
    e.preventDefault();
    if (!aiText.trim()) return;
    setAiLoading(true);
    setError('');
    try {
      await aiService.createTaskFromText(aiText);
      setAiText('');
      load();
    } catch (err) {
      setError(apiError(err, 'AI task creation failed'));
    } finally {
      setAiLoading(false);
    }
  };

  const complete = async (id) => {
    await taskService.complete(id);
    load();
  };

  const remove = async (id) => {
    await taskService.remove(id);
    setTasks((t) => t.filter((x) => x.id !== id));
  };

  return (
    <div className="space-y-4">
      <form onSubmit={aiAdd} className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder='Describe a task, e.g. "Prepare for interview next Friday"'
          value={aiText}
          onChange={(e) => setAiText(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" variant="secondary" disabled={aiLoading}>
          <Sparkles className="h-4 w-4" /> {aiLoading ? 'Thinking…' : 'AI Add'}
        </Button>
      </form>

      <form onSubmit={addTask} className="flex flex-col gap-2 sm:flex-row">
        <Input
          placeholder="New task title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="flex-1"
        />
        <select
          value={form.priority}
          onChange={(e) => setForm({ ...form, priority: e.target.value })}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <Input
          type="date"
          value={form.dueDate}
          onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
          className="sm:w-40"
        />
        <Button type="submit">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </form>

      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <Button
            key={s}
            size="sm"
            variant={filter === s ? 'default' : 'outline'}
            onClick={() => setFilter(s)}
          >
            {s.replace('_', ' ')}
          </Button>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tasks yet. Add one above.</p>
      ) : (
        <ul>
          {tasks.map((task) => (
            <li
              key={task.id}
              className={cn('task-card flex items-center justify-between gap-4', task.status === 'COMPLETED' && 'completed')}
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{task.title}</span>
                  <Badge variant={priorityVariant(task.priority)}>{task.priority}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {task.status.replace('_', ' ')}
                  {task.dueDate ? ` · due ${formatDate(task.dueDate)}` : ''}
                  {task.tags?.length ? ` · ${task.tags.join(', ')}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                {task.status !== 'COMPLETED' && (
                  <Button size="icon" variant="ghost" onClick={() => complete(task.id)} aria-label="Complete">
                    <Check className="h-4 w-4" />
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => remove(task.id)} aria-label="Delete">
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
