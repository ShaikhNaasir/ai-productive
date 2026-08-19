import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const register = vi.fn();
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ register }),
}));

import Register from '@/pages/Register';

afterEach(cleanup);

describe('Register check-your-email step (F3)', () => {
  it('shows the verification prompt when an email was sent', async () => {
    register.mockResolvedValue({ user: { email: 'new@b.com' }, verification: { delivery: 'sent' } });

    render(
      <MemoryRouter>
        <Register />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByRole('button', { name: /Create account/i }));

    expect(await screen.findByText(/Check your email/i)).toBeInTheDocument();
    expect(screen.getByText('new@b.com')).toBeInTheDocument();
  });
});
