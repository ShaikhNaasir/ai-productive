import { useState } from 'react';
import { MailWarning } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { authService } from '@/services/authService';
import { apiError } from '@/lib/api';
import { Button } from '@/components/ui/button';

// Persistent "verify your account" prompt. Renders for a signed-in, unverified,
// non-admin user and disappears once the email is confirmed. Key actions (AI,
// sharing, uploads, billing, Google) are blocked server-side until then.
export default function VerifyBanner() {
  const { user, setUser } = useAuth();
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  if (!user || user.emailVerified || user.role === 'ADMIN') return null;

  const resend = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await authService.resendVerification();
      if (res.alreadyVerified) {
        setUser({ ...user, emailVerified: true });
      } else {
        setMsg('Verification email sent. Check your inbox.');
      }
    } catch (err) {
      setMsg(apiError(err, 'Could not resend the email'));
    } finally {
      setBusy(false);
    }
  };

  // Re-fetch the user in case they verified in another tab.
  const refresh = async () => {
    setBusy(true);
    try {
      const fresh = await authService.me();
      setUser(fresh);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-3 gap-y-1">
        <MailWarning className="h-4 w-4 shrink-0" />
        <span>
          <strong>Verify your account.</strong> We sent a link to{' '}
          <span className="font-medium">{user.email}</span>. Some features stay locked until you confirm.
        </span>
        <div className="ml-auto flex items-center gap-2">
          {msg && <span className="text-xs">{msg}</span>}
          <Button size="sm" variant="outline" disabled={busy} onClick={resend}>
            Resend email
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={refresh}>
            I&apos;ve verified
          </Button>
        </div>
      </div>
    </div>
  );
}
