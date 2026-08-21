import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getToken } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import { notificationService } from '@/services/notificationService';

const NotificationContext = createContext(null);
const rawSocketUrl = import.meta.env.VITE_API_URL || 'http://localhost:4000';
const SOCKET_URL = /^https?:\/\//.test(rawSocketUrl) ? rawSocketUrl : `https://${rawSocketUrl}`;

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);

  // Catch-up: pull persisted notifications on load so anything that fired while the
  // user was away (the live socket only reaches a connected client) still shows.
  const load = useCallback(async () => {
    try {
      const data = await notificationService.list();
      setNotifications(
        data.notifications.map((n) => ({
          id: n.id,
          message: n.message,
          remindAt: n.createdAt,
          read: Boolean(n.readAt),
          at: new Date(n.createdAt).getTime(),
        }))
      );
    } catch {
      /* offline / not reachable — the bell just stays empty */
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  // Live delivery for reminders that fire while the app is open.
  useEffect(() => {
    if (!user) return undefined;
    const token = getToken();
    if (!token) return undefined;

    const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });

    socket.on('reminder', (payload) => {
      setNotifications((prev) => {
        // The scheduler also persisted this; skip if the catch-up fetch already has it.
        if (prev.some((n) => n.id === payload.id)) return prev;
        return [
          { id: payload.id, message: payload.message, remindAt: payload.remindAt, read: false, at: Date.now() },
          ...prev,
        ];
      });
    });

    return () => socket.disconnect();
  }, [user]);

  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    try {
      await notificationService.markAllRead();
    } catch {
      /* best-effort — the local state is already updated */
    }
  }, []);

  const clear = useCallback(() => setNotifications([]), []);

  const unread = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider value={{ notifications, unread, markAllRead, clear }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
}
