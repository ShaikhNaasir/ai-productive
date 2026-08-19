import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import Settings from '@/pages/Settings';
import { billingService } from '@/services/billingService';
import { googleService } from '@/services/googleService';

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Test', email: 'a@b.com' }, setUser: vi.fn() }),
}));

// Keep the sibling Google card quiet so we test the billing card in isolation.
vi.spyOn(googleService, 'status').mockResolvedValue({ configured: false, connected: false });

afterEach(cleanup);

const freeStatus = {
  plan: 'FREE',
  rawPlan: 'FREE',
  planRenewsAt: null,
  subscriptionStatus: null,
  billingConfigured: true,
  limits: { tasks: 100, notes: 50, aiMonthlyCostUsd: 2 },
  usage: { tasks: 12, notes: 3, aiMonthlyCostUsd: 0.5 },
};

describe('BillingCard (D5)', () => {
  it('renders the current plan, usage, and an Upgrade button for a FREE user', async () => {
    vi.spyOn(billingService, 'status').mockResolvedValue(freeStatus);

    render(<Settings />);

    expect(await screen.findByText('FREE')).toBeInTheDocument();
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('12 / 100')).toBeInTheDocument();
    expect(screen.getByText('$0.50 / $2.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Upgrade/i })).toBeInTheDocument();
  });

  it('starts checkout and opens Razorpay when Upgrade is clicked', async () => {
    vi.spyOn(billingService, 'status').mockResolvedValue(freeStatus);
    const checkout = vi
      .spyOn(billingService, 'checkout')
      .mockResolvedValue({ subscriptionId: 'sub_1', keyId: 'rzp_key' });
    const open = vi.fn();
    window.Razorpay = vi.fn(() => ({ open }));

    render(<Settings />);
    fireEvent.click(await screen.findByRole('button', { name: /Upgrade/i }));

    await waitFor(() => expect(checkout).toHaveBeenCalled());
    await waitFor(() => expect(open).toHaveBeenCalled());
    expect(window.Razorpay).toHaveBeenCalledWith(expect.objectContaining({ subscription_id: 'sub_1', key: 'rzp_key' }));
  });

  it('shows an unavailable message when billing is not configured', async () => {
    vi.spyOn(billingService, 'status').mockResolvedValue({ ...freeStatus, billingConfigured: false });

    render(<Settings />);

    expect(await screen.findByText(/aren’t available on this server/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Upgrade/i })).toBeNull();
  });
});
