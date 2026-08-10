import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

afterEach(() => {
  cleanup();
  localStorage.clear();
});
import App from '@/App';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';

function renderAt(path) {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </ThemeProvider>
  );
}

describe('App routing', () => {
  it('renders the login page', async () => {
    renderAt('/login');
    expect(await screen.findByText('Welcome back')).toBeInTheDocument();
  });

  it('redirects unauthenticated users away from protected routes', async () => {
    renderAt('/');
    // Without a token, the protected dashboard redirects to login.
    expect(await screen.findByText('Welcome back')).toBeInTheDocument();
  });

  it('renders the register page', async () => {
    renderAt('/register');
    expect(await screen.findByRole('heading', { name: 'Create account' })).toBeInTheDocument();
  });
});
