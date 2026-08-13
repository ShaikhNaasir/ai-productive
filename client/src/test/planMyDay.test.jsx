import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import PlanMyDay from '@/components/PlanMyDay';
import { aiService } from '@/services/aiService';

afterEach(cleanup);

describe('PlanMyDay', () => {
  it('generates a plan and renders the proposed blocks', async () => {
    vi.spyOn(aiService, 'planDay').mockResolvedValue([
      {
        title: 'Interview prep',
        startTime: '2026-08-13T09:00:00Z',
        endTime: '2026-08-13T10:00:00Z',
        reason: 'due soon',
      },
    ]);

    render(<PlanMyDay />);

    fireEvent.click(screen.getByRole('button', { name: /Plan my day/i }));

    expect(await screen.findByText('Interview prep')).toBeInTheDocument();
    expect(screen.getByText('due soon')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Accept & add to calendar/i })).toBeInTheDocument()
    );
  });
});
