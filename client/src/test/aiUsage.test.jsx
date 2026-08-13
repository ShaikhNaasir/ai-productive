import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Analytics from '@/pages/Analytics';
import { analyticsService } from '@/services/analyticsService';
import { aiService } from '@/services/aiService';

afterEach(cleanup);

describe('Analytics AI usage card', () => {
  it('renders AI cost and per-endpoint usage', async () => {
    vi.spyOn(analyticsService, 'summary').mockResolvedValue({
      completed: 1,
      pending: 2,
      overdue: 0,
      completionRate: 33,
      focusSecondsToday: 0,
      habitsTotal: 0,
      habitsCheckedToday: 0,
    });
    vi.spyOn(analyticsService, 'trends').mockResolvedValue({
      perDay: [],
      categoryWorkload: [],
      byStatus: { PENDING: 2, IN_PROGRESS: 0, COMPLETED: 1 },
    });
    vi.spyOn(aiService, 'usage').mockResolvedValue({
      callCount: 3,
      totalCostUsd: 0.06,
      totalInputTokens: 3500,
      totalOutputTokens: 1700,
      byEndpoint: [{ endpoint: 'summarize', calls: 2, costUsd: 0.0525, inputTokens: 3000, outputTokens: 1500 }],
      last7Days: [],
    });

    render(<Analytics />);

    expect(await screen.findByText('AI usage & cost')).toBeInTheDocument();
    expect(screen.getByText('$0.0600')).toBeInTheDocument();
    expect(screen.getByText('summarize')).toBeInTheDocument();
    expect(screen.getByText(/2 calls · \$0\.0525/)).toBeInTheDocument();
  });
});
