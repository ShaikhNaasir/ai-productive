import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { adminService } from '@/services/adminService';
import { apiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

export default function AdminUserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await adminService.user(id));
    } catch (err) {
      setError(apiError(err, 'Failed to load user'));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Run an action, surface any error, then refresh.
  const act = async (fn, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(apiError(err, 'Action failed'));
    } finally {
      setBusy(false);
    }
  };

  const del = async (hard) => {
    const msg = hard
      ? 'Permanently delete this user and ALL their data? This cannot be undone.'
      : 'Soft-delete this user? They will be locked out but their data is retained.';
    if (!window.confirm(msg)) return;
    setBusy(true);
    try {
      await adminService.remove(id, hard);
      navigate('/admin/users');
    } catch (err) {
      setError(apiError(err, 'Delete failed'));
      setBusy(false);
    }
  };

  if (error && !data) return <p className="text-sm text-destructive">{error}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;

  const { user, counts, ai } = data;
  const isAdmin = user.role === 'ADMIN';
  const isDisabled = user.status === 'DISABLED';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{user.email}</h1>
        <Link className="text-sm text-muted-foreground hover:underline" to="/admin/users">← Users</Link>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Card>
        <CardHeader><CardTitle className="text-base">Account</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div><p className="text-muted-foreground">Role</p><p>{isAdmin ? <Badge>ADMIN</Badge> : 'USER'}</p></div>
          <div><p className="text-muted-foreground">Status</p><p>{user.status}</p></div>
          <div><p className="text-muted-foreground">Plan</p><p>{user.plan}</p></div>
          <div><p className="text-muted-foreground">Subscription</p><p>{user.subscriptionStatus || '—'}</p></div>
          <div><p className="text-muted-foreground">Joined</p><p>{formatDate(user.createdAt)}</p></div>
          <div><p className="text-muted-foreground">Last active</p><p>{user.lastActiveAt ? formatDate(user.lastActiveAt, { withTime: true }) : '—'}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Activity (counts only)</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div><p className="text-muted-foreground">Tasks</p><p>{counts.tasks}</p></div>
          <div><p className="text-muted-foreground">Notes</p><p>{counts.notes}</p></div>
          <div><p className="text-muted-foreground">Habits</p><p>{counts.habits}</p></div>
          <div><p className="text-muted-foreground">Schedules</p><p>{counts.schedules}</p></div>
          <div><p className="text-muted-foreground">Reminders</p><p>{counts.reminders}</p></div>
          <div><p className="text-muted-foreground">Focus sessions</p><p>{counts.focusSessions}</p></div>
          <div><p className="text-muted-foreground">AI calls</p><p>{ai.calls}</p></div>
          <div><p className="text-muted-foreground">AI cost</p><p>${ai.costUsd}</p></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Moderation</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {isDisabled ? (
            <Button variant="outline" disabled={busy} onClick={() => act(() => adminService.enable(id))}>Enable</Button>
          ) : (
            <Button variant="outline" disabled={busy} onClick={() => act(() => adminService.disable(id), 'Disable this account?')}>Disable</Button>
          )}
          <Button variant="outline" disabled={busy} onClick={() => act(() => adminService.forceLogout(id), 'Force-logout this user?')}>Force logout</Button>
          {isAdmin ? (
            <Button variant="outline" disabled={busy} onClick={() => act(() => adminService.setRole(id, 'USER'), 'Revoke admin from this user?')}>Revoke admin</Button>
          ) : (
            <Button variant="outline" disabled={busy} onClick={() => act(() => adminService.setRole(id, 'ADMIN'), 'Grant admin to this user?')}>Make admin</Button>
          )}
          <Button variant="outline" disabled={busy} onClick={() => act(() => adminService.setPlan(id, user.plan === 'PAID' ? 'FREE' : 'PAID'))}>
            Set plan: {user.plan === 'PAID' ? 'FREE' : 'PAID'}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => del(false)}>Delete (soft)</Button>
          <Button variant="destructive" disabled={busy} onClick={() => del(true)}>Delete permanently</Button>
        </CardContent>
      </Card>
    </div>
  );
}
