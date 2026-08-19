import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

// --- Shared mocks ---
const login = vi.fn();
const loginTwoFactor = vi.fn();
let mockUser = { email: 'a@b.com', twoFactorEnabled: false };
const setUser = vi.fn();
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, setUser, login, loginTwoFactor }),
}));

vi.mock('@/services/authService', () => ({
  authService: {
    setup2fa: vi.fn().mockResolvedValue({ qrDataUrl: 'data:image/png;base64,AAA', secret: 'JBSWY3DP' }),
    enable2fa: vi.fn().mockResolvedValue({ backupCodes: ['aaaaa-bbbbb', 'ccccc-ddddd'] }),
    disable2fa: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
  },
}));
vi.mock('@/services/billingService', () => ({
  billingService: { status: vi.fn().mockResolvedValue({ plan: 'FREE', billingConfigured: false, limits: {}, usage: {} }) },
  loadRazorpayCheckout: vi.fn(),
}));
vi.mock('@/services/googleService', () => ({
  googleService: { status: vi.fn().mockResolvedValue({ configured: false }) },
}));

import Login from '@/pages/Login';
import Settings from '@/pages/Settings';
import { authService } from '@/services/authService';

afterEach(cleanup);

describe('Login 2FA second step (E2)', () => {
  it('asks for a code when the password step returns twoFactorRequired', async () => {
    login.mockResolvedValue({ twoFactorRequired: true, challengeToken: 'ch-1' });
    loginTwoFactor.mockResolvedValue({});

    render(
      <MemoryRouter>
        <Login />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Sign in/i }));

    expect(await screen.findByText(/Two-factor authentication/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Authentication code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }));

    await waitFor(() => expect(loginTwoFactor).toHaveBeenCalledWith('ch-1', '123456'));
  });
});

describe('Settings 2FA enable flow (E2)', () => {
  it('walks setup → confirm → backup codes', async () => {
    mockUser = { email: 'a@b.com', twoFactorEnabled: false };

    render(<Settings />);

    fireEvent.click(await screen.findByRole('button', { name: /Enable 2FA/i }));

    // QR + secret appear.
    expect(await screen.findByAltText('2FA QR code')).toBeInTheDocument();
    expect(screen.getByText('JBSWY3DP')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Enter the 6-digit code/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));

    await waitFor(() => expect(authService.enable2fa).toHaveBeenCalledWith('123456'));
    expect(await screen.findByText(/Save your backup codes/i)).toBeInTheDocument();
    expect(screen.getByText('aaaaa-bbbbb')).toBeInTheDocument();
  });
});
