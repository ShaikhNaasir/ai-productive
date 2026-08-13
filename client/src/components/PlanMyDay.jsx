import { useState } from 'react';
import { CalendarClock, Check } from 'lucide-react';
import { aiService } from '@/services/aiService';
import { apiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate } from '@/lib/utils';

function blockTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function PlanMyDay() {
  const [blocks, setBlocks] = useState(null);
  const [loading, setLoading] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    setLoading(true);
    setError('');
    setAccepted(false);
    try {
      setBlocks(await aiService.planDay());
    } catch (err) {
      setError(apiError(err, 'Could not plan your day'));
    } finally {
      setLoading(false);
    }
  };

  const accept = async () => {
    if (!blocks?.length) return;
    setAccepting(true);
    setError('');
    try {
      await aiService.acceptPlan(blocks);
      setAccepted(true);
      setBlocks(null);
    } catch (err) {
      setError(apiError(err, 'Could not add plan to your calendar'));
    } finally {
      setAccepting(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Plan my day</CardTitle>
        <Button size="sm" variant="secondary" onClick={generate} disabled={loading}>
          <CalendarClock className="h-4 w-4" /> {loading ? 'Planning…' : 'Plan my day'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {accepted && <p className="text-sm text-muted-foreground">Added to your calendar.</p>}
        {!blocks && !error && !accepted && (
          <p className="text-sm text-muted-foreground">
            Let AI block out your day around your calendar, tasks, and priorities.
          </p>
        )}
        {blocks?.length === 0 && (
          <p className="text-sm text-muted-foreground">No plan could be built — add some open tasks first.</p>
        )}
        {blocks?.length > 0 && (
          <>
            <ul className="space-y-2">
              {blocks.map((b, i) => (
                <li key={i} className="flex items-start gap-3 border-b pb-2 last:border-0">
                  <span className="whitespace-nowrap font-mono text-xs text-muted-foreground">
                    {blockTime(b.startTime)}–{blockTime(b.endTime)}
                  </span>
                  <div className="min-w-0">
                    <span className="font-medium">{b.title}</span>
                    {b.reason && <p className="text-xs text-muted-foreground">{b.reason}</p>}
                  </div>
                </li>
              ))}
            </ul>
            <div className="text-xs text-muted-foreground">{formatDate(new Date(), { withTime: false })}</div>
            <Button size="sm" onClick={accept} disabled={accepting}>
              <Check className="h-4 w-4" /> {accepting ? 'Adding…' : 'Accept & add to calendar'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
