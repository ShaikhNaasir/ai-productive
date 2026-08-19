import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

afterEach(cleanup);

let mockUser = { role: 'ADMIN' };
vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, loading: false }),
}));

vi.mock('@/services/adminService', () => ({
  adminService: { metrics: vi.fn(), users: vi.fn() },
}));

import { adminService } from '@/services/adminService';
import AdminDashboard from '@/pages/AdminDashboard';
import AdminUsers from '@/pages/AdminUsers';
import AdminRoute from '@/components/AdminRoute';

const wrap = (ui) => render(<MemoryRouter>{ui}</MemoryRouter>);

describe('AdminDashboard', () => {
  it('renders system metrics', async () => {
    adminService.metrics.mockResolvedValue({
      users: { total: 42, new7d: 3, new30d: 10, activeToday: 5, disabled: 1 },
      plans: { free: 40, paid: 2 },
      content: { tasks: 100, notes: 20, habits: 5, schedules: 8, reminders: 4, focusSessions: 12 },
      ai: { calls: 7, costUsd: 0.1234, inputTokens: 100, outputTokens: 200 },
    });

    wrap(<AdminDashboard />);

    expect(await screen.findByText('42')).toBeInTheDocument();
    expect(screen.getByText('$0.1234')).toBeInTheDocument();
  });
});

describe('AdminUsers', () => {
  it('renders a user row from the list', async () => {
    adminService.users.mockResolvedValue({
      users: [
        {
          id: 'u1',
          email: 'someone@b.com',
          name: 'Someone',
          role: 'USER',
          status: 'ACTIVE',
          plan: 'FREE',
          createdAt: '2026-08-01T00:00:00Z',
          lastActiveAt: null,
        },
      ],
      page: 1,
      limit: 25,
      total: 1,
      totalPages: 1,
    });

    wrap(<AdminUsers />);

    expect(await screen.findByText('someone@b.com')).toBeInTheDocument();
  });
});

describe('AdminRoute', () => {
  it('hides admin content from non-admins', () => {
    mockUser = { role: 'USER' };
    wrap(
      <AdminRoute>
        <div>secret-admin-content</div>
      </AdminRoute>
    );
    expect(screen.queryByText('secret-admin-content')).toBeNull();
  });

  it('shows admin content to admins', () => {
    mockUser = { role: 'ADMIN' };
    wrap(
      <AdminRoute>
        <div>secret-admin-content</div>
      </AdminRoute>
    );
    expect(screen.getByText('secret-admin-content')).toBeInTheDocument();
  });
});
