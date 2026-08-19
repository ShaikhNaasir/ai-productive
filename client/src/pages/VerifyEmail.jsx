import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { authService } from '@/services/authService';
import { useAuth } from '@/context/AuthContext';
import { apiError } from '@/lib/api';
import { Button } from '@/components/ui/button';

// Landing page for the emailed verification link (/verify-email?token=…). Public:
// the link may be opened before the SPA has a session.
export default function VerifyEmail() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [state, setState] = useState('verifying'); // verifying | success | error
  const [error, setError] = useState('');
  const ran = useRef(false);

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setState('error');
      setError('This verification link is missing its token.');
      return;
    }
    if (ran.current) return; // guard against StrictMode double-invoke
    ran.current = true;

    authService
      .verifyEmail(token)
      .then((res) => {
        setState('success');
        // If this browser is already signed in, reflect the verified state so the
        // nag banner and any gated features unlock without a reload.
        if (user && res.user) setUser({ ...user, ...res.user });
      })
      .catch((err) => {
        setState('error');
        setError(apiError(err, 'Verification failed'));
      });
  }, [params, user, setUser]);

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 text-center">
        {state === 'verifying' && <p className="text-muted-foreground">Verifying your email…</p>}

        {state === 'success' && (
          <>
            <h1 className="text-xl font-semibold">Email verified ✓</h1>
            <p className="text-sm text-muted-foreground">Your account is now fully active.</p>
            <Button onClick={() => navigate(user ? '/' : '/login')}>
              {user ? 'Go to dashboard' : 'Sign in'}
            </Button>
          </>
        )}

        {state === 'error' && (
          <>
            <h1 className="text-xl font-semibold">Verification failed</h1>
            <p className="text-sm text-destructive">{error}</p>
            <p className="text-sm text-muted-foreground">
              The link may have expired. Sign in and resend a new one from the banner.
            </p>
            <Button variant="outline" onClick={() => navigate(user ? '/' : '/login')}>
              {user ? 'Back to app' : 'Sign in'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
