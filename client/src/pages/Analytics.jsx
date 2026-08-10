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
import StatCard from '@/components/StatCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#a855f7', '#06b6d4'];

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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Completed" value={summary.completed} accent="text-green-500" />
        <StatCard label="Pending" value={summary.pending} accent="text-yellow-500" />
        <StatCard label="Overdue" value={summary.overdue} accent="text-red-500" />
        <StatCard label="Completion Rate" value={`${summary.completionRate}%`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tasks completed (last 7 days)</CardTitle>
        </CardHeader>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trends.perDay}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Bar dataKey="completed" fill="#3b82f6" radius={[4, 4, 0, 0]} />
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
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trends.categoryWorkload} layout="vertical">
                  <XAxis type="number" allowDecimals={false} fontSize={12} />
                  <YAxis type="category" dataKey="tag" fontSize={12} width={80} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#22c55e" radius={[0, 4, 4, 0]} />
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
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                  {statusData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
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
