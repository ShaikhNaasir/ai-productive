import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { adminService } from '@/services/adminService';
import { apiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const statusVariant = { ACTIVE: 'default', DISABLED: 'secondary', DELETED: 'destructive' };

export default function AdminUsers() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [plan, setPlan] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(
        await adminService.users({
          search: search || undefined,
          status: status || undefined,
          plan: plan || undefined,
          page,
          limit: 25,
        })
      );
    } catch (err) {
      setError(apiError(err, 'Failed to load users'));
    }
  }, [search, status, plan, page]);

  useEffect(() => {
    load();
  }, [load]);

  const onSearch = (e) => {
    e.preventDefault();
    setPage(1);
    load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Users</h1>
        <Link className="text-sm text-muted-foreground hover:underline" to="/admin">← Dashboard</Link>
      </div>

      <form onSubmit={onSearch} className="flex flex-wrap items-end gap-2">
        <Input
          placeholder="Search email or name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-10 max-w-xs"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="DISABLED">Disabled</option>
          <option value="DELETED">Deleted</option>
        </select>
        <select
          value={plan}
          onChange={(e) => { setPlan(e.target.value); setPage(1); }}
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">All plans</option>
          <option value="FREE">Free</option>
          <option value="PAID">Paid</option>
        </select>
        <Button type="submit">Search</Button>
      </form>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Role</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Plan</th>
                  <th className="px-3 py-2">Joined</th>
                  <th className="px-3 py-2">Last active</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link className="font-medium hover:underline" to={`/admin/users/${u.id}`}>{u.email}</Link>
                      {u.name && <span className="ml-2 text-muted-foreground">{u.name}</span>}
                    </td>
                    <td className="px-3 py-2">{u.role === 'ADMIN' ? <Badge>ADMIN</Badge> : 'USER'}</td>
                    <td className="px-3 py-2"><Badge variant={statusVariant[u.status]}>{u.status}</Badge></td>
                    <td className="px-3 py-2">{u.plan}</td>
                    <td className="px-3 py-2 text-muted-foreground">{formatDate(u.createdAt)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{u.lastActiveAt ? formatDate(u.lastActiveAt, { withTime: true }) : '—'}</td>
                  </tr>
                ))}
                {data.users.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">No users match.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{data.total} users · page {data.page} of {data.totalPages || 1}</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page >= (data.totalPages || 1)} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
