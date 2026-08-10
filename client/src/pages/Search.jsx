import { useState } from 'react';
import { Search as SearchIcon } from 'lucide-react';
import { searchService } from '@/services/searchService';
import { apiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Search() {
  const [q, setQ] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setError('');
    try {
      setData(await searchService.search(q));
    } catch (err) {
      setError(apiError(err, 'Search failed'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Search</h1>
      <form onSubmit={run} className="flex gap-2">
        <Input
          placeholder='e.g. "things related to my upcoming interview"'
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Button type="submit" disabled={loading}>
          <SearchIcon className="h-4 w-4" /> Search
        </Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading && <p className="text-sm text-muted-foreground">Searching…</p>}

      {data && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {data.results.length} result(s) · {data.mode === 'semantic' ? 'semantic (meaning-based)' : 'keyword'} search
          </p>
          {data.results.map((r) => (
            <Card key={`${r.type}-${r.id}`}>
              <CardContent className="flex items-center justify-between py-3">
                <div>
                  <span className="font-medium">{r.title}</span>
                  {r.snippet && <p className="text-xs text-muted-foreground">{r.snippet}</p>}
                </div>
                <Badge variant={r.type === 'note' ? 'secondary' : 'medium'}>{r.type}</Badge>
              </CardContent>
            </Card>
          ))}
          {data.results.length === 0 && <p className="text-sm text-muted-foreground">No matches found.</p>}
        </div>
      )}
    </div>
  );
}
