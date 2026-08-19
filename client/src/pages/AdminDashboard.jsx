import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminService } from '@/services/adminService';
import { apiError } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';

function Tile({ label, value }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    adminService
      .metrics()
      .then(setMetrics)
      .catch((err) => setError(apiError(err, 'Failed to load metrics')));
  }, []);

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!metrics) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const { users, plans, content, ai } = metrics;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin</h1>
        <nav className="flex gap-4 text-sm">
          <Link className="text-muted-foreground hover:underline" to="/admin/users">Users</Link>
          <Link className="text-muted-foreground hover:underline" to="/admin/audit">Audit log</Link>
        </nav>
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Users</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Tile label="Total" value={users.total} />
          <Tile label="New (7d)" value={users.new7d} />
          <Tile label="New (30d)" value={users.new30d} />
          <Tile label="Active today" value={users.activeToday} />
          <Tile label="Disabled" value={users.disabled} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Plans &amp; AI spend</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Tile label="Free" value={plans.free} />
          <Tile label="Paid" value={plans.paid} />
          <Tile label="AI calls" value={ai.calls} />
          <Tile label="AI cost" value={`$${ai.costUsd}`} />
          <Tile label="AI tokens" value={ai.inputTokens + ai.outputTokens} />
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Content (counts only)</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <Tile label="Tasks" value={content.tasks} />
          <Tile label="Notes" value={content.notes} />
          <Tile label="Habits" value={content.habits} />
          <Tile label="Schedules" value={content.schedules} />
          <Tile label="Reminders" value={content.reminders} />
          <Tile label="Focus" value={content.focusSessions} />
        </div>
      </section>
    </div>
  );
}
