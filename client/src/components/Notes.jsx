import { useEffect, useState, useCallback } from 'react';
import { Trash2, Pin, PinOff, Plus, Search as SearchIcon, Sparkles, Pencil, Save, X } from 'lucide-react';
import { noteService } from '@/services/noteService';
import { aiService } from '@/services/aiService';
import { apiError } from '@/lib/api';
import { useDebounce } from '@/lib/useDebounce';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';

export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 350);
  const [form, setForm] = useState({ title: '', content: '', category: '', tags: '' });
  const [summaries, setSummaries] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ title: '', content: '', category: '', tags: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setNotes(await noteService.list(debouncedQuery ? { q: debouncedQuery } : {}));
    } catch (err) {
      setError(apiError(err, 'Failed to load notes'));
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery]);

  useEffect(() => {
    load();
  }, [load]);

  const addNote = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    try {
      await noteService.create({
        title: form.title,
        content: form.content,
        category: form.category || null,
        tags: form.tags ? form.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      });
      setForm({ title: '', content: '', category: '', tags: '' });
      load();
    } catch (err) {
      setError(apiError(err, 'Failed to create note'));
    }
  };

  const startEdit = (note) => {
    setEditingId(note.id);
    setEditForm({
      title: note.title,
      content: note.content || '',
      category: note.category || '',
      tags: (note.tags || []).join(', '),
    });
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = async (id) => {
    if (!editForm.title.trim()) return;
    try {
      await noteService.update(id, {
        title: editForm.title,
        content: editForm.content,
        category: editForm.category || null,
        tags: editForm.tags ? editForm.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
      });
      setEditingId(null);
      load();
    } catch (err) {
      setError(apiError(err, 'Failed to update note'));
    }
  };

  const togglePin = async (id) => {
    await noteService.togglePin(id);
    load();
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this note?')) return;
    try {
      await noteService.remove(id);
      setNotes((n) => n.filter((x) => x.id !== id));
    } catch (err) {
      setError(apiError(err, 'Failed to delete note'));
    }
  };

  const summarize = async (id) => {
    setSummaries((s) => ({ ...s, [id]: { loading: true } }));
    try {
      const result = await aiService.summarize({ noteId: id });
      setSummaries((s) => ({ ...s, [id]: { loading: false, ...result } }));
    } catch (err) {
      setSummaries((s) => ({ ...s, [id]: { loading: false, error: apiError(err, 'Summarize failed') } }));
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">New note</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={addNote} className="space-y-2">
            <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Textarea placeholder="Write your note…" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input placeholder="Category" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              <Input placeholder="Tags (comma separated)" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} />
              <Button type="submit">
                <Plus className="h-4 w-4" /> Add
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <SearchIcon className="h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search notes…" value={query} onChange={(e) => setQuery(e.target.value)} className="max-w-xs" />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="text-sm text-muted-foreground">No notes found.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) =>
            editingId === note.id ? (
              <Card key={note.id}>
                <CardContent className="space-y-2 p-4">
                  <Input value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} aria-label="Edit title" />
                  <Textarea value={editForm.content} onChange={(e) => setEditForm({ ...editForm, content: e.target.value })} aria-label="Edit content" />
                  <Input placeholder="Category" value={editForm.category} onChange={(e) => setEditForm({ ...editForm, category: e.target.value })} />
                  <Input placeholder="Tags (comma separated)" value={editForm.tags} onChange={(e) => setEditForm({ ...editForm, tags: e.target.value })} />
                  <div className="flex justify-end gap-1">
                    <Button size="sm" onClick={() => saveEdit(note.id)}>
                      <Save className="h-4 w-4" /> Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={cancelEdit}>
                      <X className="h-4 w-4" /> Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card key={note.id}>
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <CardTitle className="text-base">{note.title}</CardTitle>
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" onClick={() => summarize(note.id)} aria-label="Summarize">
                      <Sparkles className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => startEdit(note)} aria-label="Edit">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => togglePin(note.id)} aria-label="Pin">
                      {note.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(note.id)} aria-label="Delete">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="whitespace-pre-wrap text-sm text-muted-foreground">{note.content}</p>
                  {summaries[note.id] && (
                    <div className="rounded-md bg-muted p-2 text-xs">
                      {summaries[note.id].loading ? (
                        'Summarizing…'
                      ) : summaries[note.id].error ? (
                        <span className="text-destructive">{summaries[note.id].error}</span>
                      ) : (
                        <>
                          <p className="font-semibold">Key points</p>
                          <ul className="ml-4 list-disc">
                            {summaries[note.id].key_points?.map((k, i) => (
                              <li key={i}>{k}</li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {note.category && <Badge variant="secondary">{note.category}</Badge>}
                    {note.tags?.map((t) => (
                      <Badge key={t} variant="outline">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{formatDate(note.updatedAt, { withTime: true })}</p>
                </CardContent>
              </Card>
            )
          )}
        </div>
      )}
    </div>
  );
}
