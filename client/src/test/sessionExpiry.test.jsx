import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import ProtectedRoute from '@/components/ProtectedRoute';
import { api, setToken, SESSION_EXPIRED_EVENT } from '@/lib/api';
import { authService } from '@/services/authService';

afterEach(() => {
  cleanup();
  setToken(null);
  vi.restoreAllMocks();
});

function Dashboard() {
  const { user } = useAuth();
  return <div>Signed in as {user.email}</div>;
}

function Login() {
  return <div>Please sign in</div>;
}

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('session expiry', () => {
  beforeEach(() => {
    setToken('a-token');
    vi.spyOn(authService, 'me').mockResolvedValue({ id: 'u1', email: 'me@b.com' });
  });

  it('drops the user and redirects to login when a request 401s', async () => {
    renderApp();
    expect(await screen.findByText(/Signed in as me@b.com/)).toBeInTheDocument();

    // A revoked token: the interceptor clears it and announces the dead session.
    await act(async () => {
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    });

    expect(await screen.findByText(/Please sign in/)).toBeInTheDocument();
    expect(screen.queryByText(/Signed in as/)).not.toBeInTheDocument();
  });

  it('the response interceptor clears the token and fires the event on 401', async () => {
    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);

    // Drive the interceptor directly with a 401, as axios would on a failed call.
    const rejected = api.interceptors.response.handlers[0].rejected;
    await expect(rejected({ response: { status: 401 } })).rejects.toBeDefined();

    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('pa_token')).toBeNull();
    window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  });

  it('leaves the session alone for non-401 errors', async () => {
    const onExpired = vi.fn();
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);

    const rejected = api.interceptors.response.handlers[0].rejected;
    await expect(rejected({ response: { status: 500 } })).rejects.toBeDefined();

    expect(onExpired).not.toHaveBeenCalled();
    expect(localStorage.getItem('pa_token')).toBe('a-token');
    window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  });
});
