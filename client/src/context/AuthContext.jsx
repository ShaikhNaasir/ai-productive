import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getToken, setToken, SESSION_EXPIRED_EVENT } from '@/lib/api';
import { authService } from '@/services/authService';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const me = await authService.me();
        if (active) setUser(me);
      } catch {
        setToken(null);
      } finally {
        if (active) setLoading(false);
      }
    }
    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  // A 401 anywhere in the app means the token was revoked or expired server-side.
  // Drop the user so ProtectedRoute redirects to login instead of leaving the
  // authenticated shell up with every request failing.
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  const login = useCallback(async (credentials) => {
    const data = await authService.login(credentials);
    // 2FA-enabled accounts get a challenge instead of a session; the caller collects
    // the second factor and calls loginTwoFactor. Don't set a token yet.
    if (data.twoFactorRequired) {
      return { twoFactorRequired: true, challengeToken: data.challengeToken };
    }
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const loginTwoFactor = useCallback(async (challengeToken, code) => {
    const data = await authService.login2fa({ challengeToken, code });
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (payload) => {
    const data = await authService.register(payload);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    // Best-effort server-side revocation (bumps tokenVersion), then clear locally.
    try {
      await authService.logout();
    } catch {
      // ignore — always clear the local session
    }
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, loginTwoFactor, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
