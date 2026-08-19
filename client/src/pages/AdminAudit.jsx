import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { adminService } from '@/services/adminService';
import { apiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export default function AdminAudit() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await adminService.audit({ page, limit: 50 }));
    } catch (err) {
      setError(apiError(err, 'Failed to load audit log'));
    }
  }, [page]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Audit log</h1>
        <Link className="text-sm text-muted-foreground hover:underline" to="/admin">← Dashboard</Link>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && (
        <>
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Action</th>
                  <th className="px-3 py-2">Admin</th>
                  <th className="px-3 py-2">Target</th>
                </tr>
              </thead>
              <tbody>
                {data.logs.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-muted-foreground">{formatDate(l.createdAt, { withTime: true })}</td>
                    <td className="px-3 py-2 font-mono text-xs">{l.action}</td>
                    <td className="px-3 py-2 font-mono text-xs">{l.adminId?.slice(0, 8)}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {l.targetUserId ? (
                        <Link className="hover:underline" to={`/admin/users/${l.targetUserId}`}>{l.targetUserId.slice(0, 8)}</Link>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
                {data.logs.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">No actions logged yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{data.total} entries · page {data.page} of {data.totalPages || 1}</span>
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
