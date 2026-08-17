import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import Settings from '@/pages/Settings';
import Calendar from '@/components/Calendar';
import { googleService } from '@/services/googleService';
import { calendarService } from '@/services/calendarService';

// Settings uses useAuth; stub it so we can render the page in isolation.
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Test', email: 'a@b.com' }, setUser: vi.fn() }),
}));

// jsdom's window.location (and its assign) is read-only; replace it wholesale with
// a plain stub so we can assert navigation on connect.
const assignMock = vi.fn();
Object.defineProperty(window, 'location', {
  configurable: true,
  value: { assign: assignMock, search: '', href: 'http://localhost/', origin: 'http://localhost' },
});

beforeEach(() => {
  assignMock.mockClear();
});
afterEach(cleanup);

describe('Google Calendar settings (C1.3)', () => {
  it('shows Connect and starts the OAuth flow when disconnected', async () => {
    vi.spyOn(googleService, 'status').mockResolvedValue({ configured: true, connected: false, calendarId: null });
    const authUrl = vi
      .spyOn(googleService, 'authUrl')
      .mockResolvedValue('https://accounts.google.com/o/oauth2/v2/auth?x');

    render(<Settings />);

    fireEvent.click(await screen.findByRole('button', { name: /Connect Google Calendar/i }));
    await waitFor(() => expect(authUrl).toHaveBeenCalled());
    await waitFor(() => expect(window.location.assign).toHaveBeenCalledWith(expect.stringContaining('accounts.google.com')));
  });

  it('syncs on demand when connected', async () => {
    vi.spyOn(googleService, 'status').mockResolvedValue({ configured: true, connected: true, calendarId: 'primary' });
    const sync = vi.spyOn(googleService, 'sync').mockResolvedValue({ pulled: 2, pushed: 1 });

    render(<Settings />);

    fireEvent.click(await screen.findByRole('button', { name: /Sync now/i }));
    await waitFor(() => expect(sync).toHaveBeenCalled());
    expect(await screen.findByText('Synced. Pulled 2, pushed 1.')).toBeInTheDocument();
  });

  it('disconnects and returns to the connect state', async () => {
    vi.spyOn(googleService, 'status')
      .mockResolvedValueOnce({ configured: true, connected: true, calendarId: 'primary' })
      .mockResolvedValueOnce({ configured: true, connected: false, calendarId: null });
    const disconnect = vi.spyOn(googleService, 'disconnect').mockResolvedValue({});

    render(<Settings />);

    fireEvent.click(await screen.findByRole('button', { name: /Disconnect/i }));
    await waitFor(() => expect(disconnect).toHaveBeenCalled());
    expect(await screen.findByRole('button', { name: /Connect Google Calendar/i })).toBeInTheDocument();
  });
});

describe('Calendar synced badge (C1.3)', () => {
  it('marks Google-linked schedule events as Synced', async () => {
    vi.spyOn(calendarService, 'events').mockResolvedValue([
      { type: 'schedule', id: 's1', title: 'Synced meeting', date: '2026-08-20T09:00:00Z', meta: { googleEventId: 'g1' } },
    ]);

    render(<Calendar />);

    expect(await screen.findByText('Synced meeting')).toBeInTheDocument();
    expect(screen.getByText('Synced')).toBeInTheDocument();
  });
});
