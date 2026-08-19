import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { authService } from '@/services/authService';
import { googleService } from '@/services/googleService';
import { billingService, loadRazorpayCheckout } from '@/services/billingService';
import { apiError } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

function Status({ msg }) {
  if (!msg) return null;
  return <p className={`text-sm ${msg.ok ? 'text-foreground' : 'text-destructive'}`}>{msg.text}</p>;
}

function GoogleCalendarCard() {
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadStatus = async () => {
    try {
      setStatus(await googleService.status());
    } catch (err) {
      setMsg({ ok: false, text: apiError(err, 'Failed to load Google status') });
    }
  };

  useEffect(() => {
    loadStatus();
    // The OAuth callback redirects back here with ?google=connected.
    if (new URLSearchParams(window.location.search).get('google') === 'connected') {
      setMsg({ ok: true, text: 'Google Calendar connected.' });
    }
  }, []);

  const connect = async () => {
    setMsg(null);
    try {
      window.location.assign(await googleService.authUrl());
    } catch (err) {
      setMsg({ ok: false, text: apiError(err, 'Could not start Google sign-in') });
    }
  };

  const syncNow = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await googleService.sync();
      setMsg({ ok: true, text: `Synced. Pulled ${r.pulled ?? 0}, pushed ${r.pushed ?? 0}.` });
    } catch (err) {
      setMsg({ ok: false, text: apiError(err, 'Sync failed') });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setMsg(null);
    try {
      await googleService.disconnect();
      await loadStatus();
      setMsg({ ok: true, text: 'Disconnected.' });
    } catch (err) {
      setMsg({ ok: false, text: apiError(err, 'Disconnect failed') });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Google Calendar</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {status && !status.configured && (
          <p className="text-sm text-muted-foreground">
            Google Calendar integration is not configured on the server.
          </p>
        )}
        {status && status.configured && !status.connected && (
          <>
            <p className="text-sm text-muted-foreground">
              Connect your Google Calendar to sync events both ways.
            </p>
            <Button type="button" onClick={connect}>
              Connect Google Calendar
            </Button>
          </>
        )}
        {status && status.connected && (
          <>
            <p className="text-sm">
              Connected · calendar <span className="font-medium">{status.calendarId}</span>
            </p>
            <div className="flex gap-2">
              <Button type="button" onClick={syncNow} disabled={busy}>
                {busy ? 'Syncing…' : 'Sync now'}
              </Button>
              <Button type="button" variant="secondary" onClick={disconnect}>
                Disconnect
              </Button>
            </div>
          </>
        )}
        <Status msg={msg} />
      </CardContent>
    </Card>
  );
}

// One usage row: used vs. plan limit (null limit = unlimited).
function UsageRow({ label, used, limit, format = (n) => n }) {
  const unlimited = limit === null || limit === undefined;
  const pct = unlimited ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const over = !unlimited && used >= limit;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={over ? 'font-medium text-destructive' : ''}>
          {format(used)} {unlimited ? '· Unlimited' : `/ ${format(limit)}`}
        </span>
      </div>
      {!unlimited && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className={`h-full ${over ? 'bg-destructive' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

function BillingCard() {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setData(await billingService.status());
    } catch (err) {
      setMsg({ ok: false, text: apiError(err, 'Failed to load billing status') });
    }
  };

  useEffect(() => {
    load();
  }, []);

  const upgrade = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { subscriptionId, keyId } = await billingService.checkout();
      const Razorpay = await loadRazorpayCheckout();
      const rzp = new Razorpay({
        key: keyId,
        subscription_id: subscriptionId,
        name: 'Productivity Assistant',
        description: 'Paid plan',
        handler: async (resp) => {
          try {
            await billingService.verify({
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_subscription_id: resp.razorpay_subscription_id,
              razorpay_signature: resp.razorpay_signature,
            });
            await load();
            setMsg({ ok: true, text: 'You are now on the paid plan. Thank you!' });
          } catch (err) {
            setMsg({ ok: false, text: apiError(err, 'Payment could not be verified') });
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.open();
    } catch (err) {
      setMsg({ ok: false, text: apiError(err, 'Could not start checkout') });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!window.confirm('Cancel your subscription? You keep access until the current period ends.')) return;
    setBusy(true);
    setMsg(null);
    try {
      await billingService.cancel();
      await load();
      setMsg({ ok: true, text: 'Subscription cancelled. Access continues until the period ends.' });
    } catch (err) {
      setMsg({ ok: false, text: apiError(err, 'Cancel failed') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Plan &amp; billing
          {data && <Badge variant={data.plan === 'PAID' ? 'default' : 'secondary'}>{data.plan}</Badge>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data && (
          <>
            <div className="space-y-3">
              <UsageRow label="Tasks" used={data.usage.tasks} limit={data.limits.tasks} />
              <UsageRow label="Notes" used={data.usage.notes} limit={data.limits.notes} />
              <UsageRow
                label="AI spend this month"
                used={data.usage.aiMonthlyCostUsd}
                limit={data.limits.aiMonthlyCostUsd}
                format={(n) => `$${Number(n).toFixed(2)}`}
              />
            </div>

            {data.plan === 'PAID' ? (
              <div className="space-y-2 text-sm">
                {data.planRenewsAt && (
                  <p className="text-muted-foreground">
                    {data.subscriptionStatus === 'cancelled' ? 'Access until' : 'Renews'}{' '}
                    {formatDate(data.planRenewsAt)}
                  </p>
                )}
                {data.subscriptionStatus !== 'cancelled' && (
                  <Button type="button" variant="secondary" disabled={busy} onClick={cancel}>
                    Cancel subscription
                  </Button>
                )}
              </div>
            ) : data.billingConfigured ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Upgrade for higher limits and more monthly AI.
                </p>
                <Button type="button" disabled={busy} onClick={upgrade}>
                  {busy ? 'Starting…' : 'Upgrade'}
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Paid plans aren’t available on this server yet.
              </p>
            )}
          </>
        )}
        <Status msg={msg} />
      </CardContent>
    </Card>
  );
}

function TwoFactorCard() {
  const { user, setUser } = useAuth();
  const [mode, setMode] = useState('idle'); // idle | setup | backup
  const [setup, setSetup] = useState(null); // { qrDataUrl, secret }
  const [code, setCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const enabled = user?.twoFactorEnabled;

  const startSetup = async () => {
    setBusy(true);
    setMsg(null);
    try {
      setSetup(await authService.setup2fa());
      setMode('setup');
    } catch (err) {
      setMsg({ ok: false, text: apiError(err, 'Could not start setup') });
    } finally {
      setBusy(false);
    }
  };

  const confirmEnable = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await authService.enable2fa(code.trim());
      setBackupCodes(res.backupCodes || []);
      setMode('backup');
      setCode('');
      setUser({ ...user, twoFactorEnabled: true });
    } catch (err) {
      setMsg({ ok: false, text: apiError(err, 'Could not enable 2FA') });
    } finally {
      setBusy(false);
    }
  };

  const disable = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await authService.disable2fa(code.trim());
      setUser({ ...user, twoFactorEnabled: false });
      setCode('');
      setMsg({ ok: true, text: 'Two-factor authentication disabled.' });
    } catch (err) {
      setMsg({ ok: false, text: apiError(err, 'Could not disable 2FA') });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Two-factor authentication
          <Badge variant={enabled ? 'default' : 'secondary'}>{enabled ? 'On' : 'Off'}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Enabled: offer disable (requires a current code). */}
        {enabled && mode !== 'backup' && (
          <form onSubmit={disable} className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Your account is protected with an authenticator app. Enter a code to turn it off.
            </p>
            <Input
              placeholder="6-digit or backup code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="max-w-xs"
            />
            <Button type="submit" variant="destructive" disabled={busy || !code}>
              Disable 2FA
            </Button>
          </form>
        )}

        {/* Disabled + idle: offer to start setup. */}
        {!enabled && mode === 'idle' && (
          <>
            <p className="text-sm text-muted-foreground">
              Add a second step at login with an authenticator app (Google Authenticator, Authy…).
            </p>
            <Button type="button" onClick={startSetup} disabled={busy}>
              Enable 2FA
            </Button>
          </>
        )}

        {/* Setup: scan the QR (or enter the secret), then confirm a code. */}
        {mode === 'setup' && setup && (
          <form onSubmit={confirmEnable} className="space-y-3">
            <p className="text-sm text-muted-foreground">Scan this with your authenticator app:</p>
            <img src={setup.qrDataUrl} alt="2FA QR code" className="h-40 w-40 rounded border bg-white p-1" />
            <p className="text-xs text-muted-foreground">
              Or enter this key manually: <span className="font-mono">{setup.secret}</span>
            </p>
            <Input
              placeholder="Enter the 6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="max-w-xs"
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !code}>Confirm</Button>
              <Button type="button" variant="ghost" onClick={() => { setMode('idle'); setCode(''); }}>
                Cancel
              </Button>
            </div>
          </form>
        )}

        {/* Backup codes: shown exactly once after enabling. */}
        {mode === 'backup' && (
          <div className="space-y-3">
            <p className="text-sm font-medium text-foreground">Save your backup codes</p>
            <p className="text-sm text-muted-foreground">
              Each works once if you lose your device. They won&apos;t be shown again.
            </p>
            <div className="grid grid-cols-2 gap-1 rounded-md border bg-muted/40 p-3 font-mono text-sm">
              {backupCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <Button type="button" onClick={() => setMode('idle')}>
              I&apos;ve saved them
            </Button>
          </div>
        )}

        <Status msg={msg} />
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { user, setUser } = useAuth();
  const [profile, setProfile] = useState({ name: user?.name || '', email: user?.email || '' });
  const [profileMsg, setProfileMsg] = useState(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [pwMsg, setPwMsg] = useState(null);

  const saveProfile = async (e) => {
    e.preventDefault();
    setProfileMsg(null);
    try {
      const updated = await authService.updateProfile(profile);
      setUser(updated);
      setProfileMsg({ ok: true, text: 'Profile updated.' });
    } catch (err) {
      setProfileMsg({ ok: false, text: apiError(err, 'Update failed') });
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setPwMsg(null);
    try {
      await authService.changePassword(pw);
      setPw({ currentPassword: '', newPassword: '' });
      setPwMsg({ ok: true, text: 'Password changed.' });
    } catch (err) {
      setPwMsg({ ok: false, text: apiError(err, 'Change failed') });
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveProfile} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
            </div>
            <Status msg={profileMsg} />
            <Button type="submit">Save profile</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Change password</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={changePassword} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="current">Current password</Label>
              <Input id="current" type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new">New password</Label>
              <Input id="new" type="password" minLength={8} value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
            </div>
            <Status msg={pwMsg} />
            <Button type="submit">Change password</Button>
          </form>
        </CardContent>
      </Card>

      <BillingCard />

      <TwoFactorCard />

      <GoogleCalendarCard />
    </div>
  );
}
