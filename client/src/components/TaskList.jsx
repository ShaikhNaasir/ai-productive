import { useEffect, useState, useCallback } from 'react';
import { Trash2, Check, Plus, Sparkles, Pencil, X, Save } from 'lucide-react';
import { taskService } from '@/services/taskService';
import { aiService } from '@/services/aiService';
import { apiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn, formatDate } from '@/lib/utils';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'];
const STATUSES = ['ALL', 'PENDING', 'IN_PROGRESS', 'COMPLETED'];
const RECURRENCES = ['NONE', 'DAILY', 'WEEKLY', 'MONTHLY'];

function priorityVariant(p) {
  return { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' }[p] || 'secondary';
}

function toDateInput(value) {
  if (!value) return '';
  return new Date(value).toISOString().slice(0, 10);
}

export default function TaskList() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [form, setForm] = useState({ title: '', priority: 'MEDIUM', dueDate: '', recurrence: 'NONE' });
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', priority: 'MEDIUM', dueDate: '' });

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
      if (form.recurrence !== 'NONE') payload.recurrence = form.recurrence;
      await taskService.create(payload);
      setForm({ title: '', priority: 'MEDIUM', dueDate: '', recurrence: 'NONE' });
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

  const updateStatus = async (id, status) => {
    try {
      await taskService.update(id, { status });
      load();
    } catch (err) {
      setError(apiError(err, 'Failed to update status'));
    }
  };

  const startEdit = (task) => {
    setEditingId(task.id);
    setEditForm({ title: task.title, priority: task.priority, dueDate: toDateInput(task.dueDate) });
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (id) => {
    if (!editForm.title.trim()) return;
    try {
      await taskService.update(id, {
        title: editForm.title,
        priority: editForm.priority,
        dueDate: editForm.dueDate || null,
      });
      setEditingId(null);
      load();
    } catch (err) {
      setError(apiError(err, 'Failed to update task'));
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this task?')) return;
    try {
      await taskService.remove(id);
      setTasks((t) => t.filter((x) => x.id !== id));
    } catch (err) {
      setError(apiError(err, 'Failed to delete task'));
    }
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
        <select
          value={form.recurrence}
          onChange={(e) => setForm({ ...form, recurrence: e.target.value })}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          aria-label="Repeat"
        >
          {RECURRENCES.map((r) => (
            <option key={r} value={r}>
              {r === 'NONE' ? 'No repeat' : r}
            </option>
          ))}
        </select>
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
          {tasks.map((task) =>
            editingId === task.id ? (
              <li key={task.id} className="task-card flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="flex-1"
                  aria-label="Edit title"
                />
                <select
                  value={editForm.priority}
                  onChange={(e) => setEditForm({ ...editForm, priority: e.target.value })}
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
                  value={editForm.dueDate}
                  onChange={(e) => setEditForm({ ...editForm, dueDate: e.target.value })}
                  className="sm:w-40"
                />
                <div className="flex gap-1">
                  <Button size="icon" onClick={() => saveEdit(task.id)} aria-label="Save">
                    <Save className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={cancelEdit} aria-label="Cancel">
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ) : (
              <li
                key={task.id}
                className={cn('task-card flex items-center justify-between gap-4', task.status === 'COMPLETED' && 'completed')}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{task.title}</span>
                    <Badge variant={priorityVariant(task.priority)}>{task.priority}</Badge>
                    {task.recurrence && task.recurrence !== 'NONE' && (
                      <Badge variant="secondary">{task.recurrence}</Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {task.status.replace('_', ' ')}
                    {task.dueDate ? ` · due ${formatDate(task.dueDate)}` : ''}
                    {task.tags?.length ? ` · ${task.tags.join(', ')}` : ''}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <select
                    value={task.status}
                    onChange={(e) => updateStatus(task.id, e.target.value)}
                    className="h-9 rounded-md border border-input bg-background px-2 text-xs"
                    aria-label="Task status"
                  >
                    <option value="PENDING">Pending</option>
                    <option value="IN_PROGRESS">In Progress</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                  {task.status !== 'COMPLETED' && (
                    <Button size="icon" variant="ghost" onClick={() => complete(task.id)} aria-label="Mark complete">
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => startEdit(task)} aria-label="Edit">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => remove(task.id)} aria-label="Delete">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
