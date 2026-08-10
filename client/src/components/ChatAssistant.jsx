import { useState, useRef, useEffect } from 'react';
import { Send } from 'lucide-react';
import { aiService } from '@/services/aiService';
import { apiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const SUGGESTIONS = [
  'What do I need to finish today?',
  'Which tasks should I prioritize?',
  'Summarize my project notes.',
  'What deadlines are coming this week?',
];

export default function ChatAssistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (text) => {
    const message = (text ?? input).trim();
    if (!message || loading) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((m) => [...m, { role: 'user', content: message }]);
    setInput('');
    setLoading(true);
    try {
      const reply = await aiService.chat(message, history);
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'assistant', content: `⚠️ ${apiError(err, 'Assistant unavailable')}`, error: true }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="flex h-[70vh] flex-col">
      <CardContent ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>Ask me about your tasks, notes, schedule, or to plan your day.</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => (
                <Button key={s} variant="outline" size="sm" onClick={() => send(s)}>
                  {s}
                </Button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[80%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm',
                m.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : m.error
                    ? 'bg-destructive/10 text-destructive'
                    : 'bg-muted'
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && <div className="text-sm text-muted-foreground">Assistant is thinking…</div>}
      </CardContent>
      <div className="border-t p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex gap-2"
        >
          <Input placeholder="Ask your assistant…" value={input} onChange={(e) => setInput(e.target.value)} disabled={loading} />
          <Button type="submit" size="icon" disabled={loading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}
