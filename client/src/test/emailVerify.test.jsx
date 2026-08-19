import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

let mockUser = { email: 'a@b.com', emailVerified: false, role: 'USER' };
const setUser = vi.fn();
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, setUser }),
}));

vi.mock('@/services/authService', () => ({
  authService: {
    resendVerification: vi.fn().mockResolvedValue({ success: true }),
    verifyEmail: vi.fn().mockResolvedValue({ success: true, user: { emailVerified: true } }),
    me: vi.fn(),
  },
}));

import VerifyBanner from '@/components/VerifyBanner';
import VerifyEmail from '@/pages/VerifyEmail';
import { authService } from '@/services/authService';

afterEach(cleanup);

describe('VerifyBanner (E1)', () => {
  it('shows for an unverified non-admin user', () => {
    mockUser = { email: 'a@b.com', emailVerified: false, role: 'USER' };
    render(<VerifyBanner />);
    expect(screen.getByText(/Verify your account/i)).toBeInTheDocument();
  });

  it('is hidden once verified', () => {
    mockUser = { email: 'a@b.com', emailVerified: true, role: 'USER' };
    const { container } = render(<VerifyBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('is hidden for admins', () => {
    mockUser = { email: 'a@b.com', emailVerified: false, role: 'ADMIN' };
    const { container } = render(<VerifyBanner />);
    expect(container).toBeEmptyDOMElement();
  });

  it('resends the verification email', async () => {
    mockUser = { email: 'a@b.com', emailVerified: false, role: 'USER' };
    render(<VerifyBanner />);
    fireEvent.click(screen.getByRole('button', { name: /Resend email/i }));
    await waitFor(() => expect(authService.resendVerification).toHaveBeenCalled());
    expect(await screen.findByText(/Verification email sent/i)).toBeInTheDocument();
  });
});

describe('VerifyEmail page (E1)', () => {
  it('verifies the token and shows success', async () => {
    mockUser = { email: 'a@b.com', emailVerified: false, role: 'USER' };
    render(
      <MemoryRouter initialEntries={['/verify-email?token=good-token']}>
        <VerifyEmail />
      </MemoryRouter>
    );
    await waitFor(() => expect(authService.verifyEmail).toHaveBeenCalledWith('good-token'));
    expect(await screen.findByText(/Email verified/i)).toBeInTheDocument();
  });
});
