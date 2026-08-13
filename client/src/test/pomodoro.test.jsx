import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import PomodoroTimer from '@/components/PomodoroTimer';
import { taskService } from '@/services/taskService';
import { focusService } from '@/services/focusService';

afterEach(cleanup);

describe('PomodoroTimer', () => {
  it('renders the countdown, a Start control, and loads tasks into the picker', async () => {
    vi.spyOn(taskService, 'list').mockResolvedValue([{ id: 't1', title: 'Write report' }]);
    vi.spyOn(focusService, 'stats').mockResolvedValue({ total: 0, perDay: [], perTask: [] });

    render(<PomodoroTimer />);

    expect(screen.getByLabelText('Time remaining')).toHaveTextContent('25:00');
    expect(screen.getByRole('button', { name: /Start/i })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Write report' })).toBeInTheDocument();
  });

  it('formats today\'s tracked total', async () => {
    vi.spyOn(taskService, 'list').mockResolvedValue([]);
    vi.spyOn(focusService, 'stats').mockResolvedValue({ total: 3720, perDay: [], perTask: [] });

    render(<PomodoroTimer />);
    await waitFor(() => expect(screen.getByText(/Today: 1h 2m/)).toBeInTheDocument());
  });
});
