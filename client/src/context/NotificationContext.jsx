import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { io } from 'socket.io-client';
import { getToken } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const NotificationContext = createContext(null);
const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    if (!user) return undefined;
    const token = getToken();
    if (!token) return undefined;

    const socket = io(SOCKET_URL, { auth: { token }, transports: ['websocket', 'polling'] });

    socket.on('reminder', (payload) => {
      setNotifications((prev) => [
        { id: payload.id, message: payload.message, remindAt: payload.remindAt, read: false, at: Date.now() },
        ...prev,
      ]);
    });

    return () => socket.disconnect();
  }, [user]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
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
