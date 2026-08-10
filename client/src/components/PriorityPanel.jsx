import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { aiService } from '@/services/aiService';
import { apiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const emoji = { HIGH: '🔥', MEDIUM: '🟡', LOW: '🟢' };
const variant = { HIGH: 'high', MEDIUM: 'medium', LOW: 'low' };

export default function PriorityPanel() {
  const [recs, setRecs] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setLoading(true);
    setError('');
    try {
      setRecs(await aiService.prioritize());
    } catch (err) {
      setError(apiError(err, 'Prioritization failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">AI Prioritization</CardTitle>
        <Button size="sm" variant="secondary" onClick={run} disabled={loading}>
          <Sparkles className="h-4 w-4" /> {loading ? 'Analyzing…' : 'Suggest priorities'}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!recs && !error && (
          <p className="text-sm text-muted-foreground">
            Let AI rank your open tasks by deadline, importance, and workload.
          </p>
        )}
        {recs?.length === 0 && <p className="text-sm text-muted-foreground">No open tasks to prioritize.</p>}
        {recs?.map((r, i) => (
          <div key={r.id || i} className="flex items-start gap-2 border-b pb-2 last:border-0">
            <span>{emoji[r.priority] || '•'}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium">{r.title}</span>
                <Badge variant={variant[r.priority] || 'secondary'}>{r.priority}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{r.reason}</p>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
