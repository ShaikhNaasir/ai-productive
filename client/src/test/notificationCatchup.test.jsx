import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';

vi.mock('socket.io-client', () => ({ io: () => ({ on: vi.fn(), disconnect: vi.fn() }) }));
// No token → the socket effect early-returns, so no live connection is opened in jsdom.
vi.mock('@/lib/api', () => ({ getToken: () => null, api: {} }));
// Return a STABLE user reference — a fresh object each call would change the effect's
// dependency every render and spin an infinite load → re-render loop.
vi.mock('@/context/AuthContext', () => {
  const user = { id: 'u1' };
  return { useAuth: () => ({ user }) };
});
vi.mock('@/services/notificationService', () => ({
  notificationService: {
    list: vi.fn().mockResolvedValue({
      notifications: [{ id: 'n1', message: 'Call mom', createdAt: '2026-08-20T09:00:00Z', readAt: null }],
      unread: 1,
    }),
    markAllRead: vi.fn().mockResolvedValue({}),
  },
}));

import { NotificationProvider, useNotifications } from '@/context/NotificationContext';
import { notificationService } from '@/services/notificationService';

function Probe() {
  const { notifications, unread, markAllRead } = useNotifications();
  return (
    <div>
      <span>count:{notifications.length}</span>
      <span>unread:{unread}</span>
      <button onClick={markAllRead}>read</button>
    </div>
  );
}

afterEach(cleanup);

describe('NotificationContext catch-up (G1)', () => {
  it('loads persisted notifications on mount so missed reminders show', async () => {
    render(
      <NotificationProvider>
        <Probe />
      </NotificationProvider>
    );

    expect(await screen.findByText('count:1')).toBeInTheDocument();
    expect(screen.getByText('unread:1')).toBeInTheDocument();
    expect(notificationService.list).toHaveBeenCalled();
  });

  it('marking all read clears the unread badge and calls the server', async () => {
    render(
      <NotificationProvider>
        <Probe />
      </NotificationProvider>
    );
    await screen.findByText('count:1');

    fireEvent.click(screen.getByRole('button', { name: 'read' }));

    await waitFor(() => expect(screen.getByText('unread:0')).toBeInTheDocument());
    expect(notificationService.markAllRead).toHaveBeenCalled();
  });
});
