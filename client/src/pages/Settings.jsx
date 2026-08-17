import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { authService } from '@/services/authService';
import { googleService } from '@/services/googleService';
import { apiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

      <GoogleCalendarCard />
    </div>
  );
}
