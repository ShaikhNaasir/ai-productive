import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import AuthLayout from '@/components/AuthLayout';

afterEach(cleanup);

describe('AuthLayout', () => {
  it('renders the brand, a rotating quote, and the form slot', () => {
    render(
      <AuthLayout>
        <div>form-goes-here</div>
      </AuthLayout>
    );

    // Brand shown (desktop + mobile blocks).
    expect(screen.getAllByText('Productivity Assistant').length).toBeGreaterThan(0);
    // The wrapped form content renders.
    expect(screen.getByText('form-goes-here')).toBeInTheDocument();
    // A quote author line (em-dash prefix) is present.
    expect(screen.getAllByText(/—/).length).toBeGreaterThan(0);
  });
});
