import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { useAuth } from '@/context/AuthContext';
import { analyticsService } from '@/services/analyticsService';
import StatCard from '@/components/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [trends, setTrends] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [s, t] = await Promise.all([analyticsService.summary(), analyticsService.trends()]);
        setSummary(s);
        setTrends(t);
      } catch {
        // Dashboard still renders without analytics.
      }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Welcome{user?.name ? `, ${user.name}` : ''}</h1>
        <p className="text-muted-foreground">Here is your productivity overview.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Completed" value={summary?.completed ?? '—'} />
        <StatCard label="Pending" value={summary?.pending ?? '—'} />
        <StatCard label="Overdue" value={summary?.overdue ?? '—'} />
        <StatCard label="Completion" value={summary ? `${summary.completionRate}%` : '—'} />
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Weekly progress</CardTitle>
          <Button asChild size="sm" variant="ghost">
            <Link to="/analytics">View analytics</Link>
          </Button>
        </CardHeader>
        <CardContent className="h-48">
          {trends ? (
            <ResponsiveContainer width="100%" height="100%" className="text-foreground">
              <BarChart data={trends.perDay}>
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={12} />
                <Tooltip />
                <Bar dataKey="completed" fill="currentColor" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">No data yet.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { to: '/tasks', label: 'Tasks' },
          { to: '/notes', label: 'Notes' },
          { to: '/calendar', label: 'Calendar' },
          { to: '/assistant', label: 'Assistant' },
        ].map((c) => (
          <Card key={c.to}>
            <CardHeader>
              <CardTitle className="text-base">{c.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" size="sm">
                <Link to={c.to}>Open {c.label}</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
