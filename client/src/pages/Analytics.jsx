import { useEffect, useState } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts';
import { analyticsService } from '@/services/analyticsService';
import { apiError } from '@/lib/api';
import { formatDuration } from '@/lib/utils';
import StatCard from '@/components/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

// Monochrome: distinguish slices by opacity of the current (theme) foreground color.
const SLICE_OPACITY = [0.9, 0.6, 0.35, 0.75, 0.5, 0.25];

export default function Analytics() {
  const [summary, setSummary] = useState(null);
  const [trends, setTrends] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const [s, t] = await Promise.all([analyticsService.summary(), analyticsService.trends()]);
        setSummary(s);
        setTrends(t);
      } catch (err) {
        setError(apiError(err, 'Failed to load analytics'));
      }
    })();
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!summary || !trends) return <p className="text-sm text-muted-foreground">Loading analytics…</p>;

  const statusData = Object.entries(trends.byStatus).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Analytics</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Completed" value={summary.completed} />
        <StatCard label="Pending" value={summary.pending} />
        <StatCard label="Overdue" value={summary.overdue} />
        <StatCard label="Completion Rate" value={`${summary.completionRate}%`} />
        <StatCard label="Focus Today" value={formatDuration(summary.focusSecondsToday || 0)} />
        <StatCard
          label="Habits Today"
          value={`${summary.habitsCheckedToday ?? 0}/${summary.habitsTotal ?? 0}`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tasks completed (last 7 days)</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%" className="text-foreground">
            <BarChart data={trends.perDay}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Bar dataKey="completed" fill="currentColor" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Category workload</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            {trends.categoryWorkload.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tagged tasks yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%" className="text-foreground">
                <BarChart data={trends.categoryWorkload} layout="vertical">
                  <XAxis type="number" allowDecimals={false} fontSize={12} />
                  <YAxis type="category" dataKey="tag" fontSize={12} width={80} />
                  <Tooltip />
                  <Bar dataKey="count" fill="currentColor" fillOpacity={0.7} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Status breakdown</CardTitle>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%" className="text-foreground">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {statusData.map((_, i) => (
                    <Cell key={i} fill="currentColor" fillOpacity={SLICE_OPACITY[i % SLICE_OPACITY.length]} stroke="hsl(var(--background))" />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
