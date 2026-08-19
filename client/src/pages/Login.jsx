import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { apiError } from '@/lib/api';
import AuthLayout from '@/components/AuthLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export default function Login() {
  const { login, loginTwoFactor } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Only redirect to an internal absolute path — never an off-site URL (open-redirect guard).
  const rawFrom = location.state?.from?.pathname || '/';
  const from = rawFrom.startsWith('/') && !rawFrom.startsWith('//') ? rawFrom : '/';

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  // Second-factor step: after a correct password, a 2FA-enabled account must enter a code.
  const [challenge, setChallenge] = useState(null);
  const [code, setCode] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await login(form);
      if (res && res.twoFactorRequired) {
        setChallenge(res.challengeToken);
      } else {
        navigate(from, { replace: true });
      }
    } catch (err) {
      setError(apiError(err, 'Login failed'));
    } finally {
      setLoading(false);
    }
  };

  const submit2fa = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginTwoFactor(challenge, code.trim());
      navigate(from, { replace: true });
    } catch (err) {
      setError(apiError(err, 'Verification failed'));
    } finally {
      setLoading(false);
    }
  };

  if (challenge) {
    return (
      <AuthLayout>
        <Card className="w-full border-0 shadow-lg sm:border">
          <CardHeader>
            <CardTitle className="text-2xl">Two-factor authentication</CardTitle>
            <CardDescription>Enter the 6-digit code from your authenticator app (or a backup code).</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit2fa} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="code">Authentication code</Label>
                <Input
                  id="code"
                  autoFocus
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Verifying…
                  </>
                ) : (
                  'Verify'
                )}
              </Button>
              <button
                type="button"
                onClick={() => { setChallenge(null); setCode(''); setError(''); }}
                className="w-full text-center text-sm text-muted-foreground hover:underline"
              >
                Back to sign in
              </button>
            </form>
          </CardContent>
        </Card>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <Card className="w-full border-0 shadow-lg sm:border">
        <CardHeader>
          <CardTitle className="text-2xl">Welcome back</CardTitle>
          <CardDescription>Sign in to your productivity assistant</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPw ? 'text' : 'password'}
                  required
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                >
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            No account?{' '}
            <Link to="/register" className="text-primary hover:underline">
              Register
            </Link>
          </p>
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
