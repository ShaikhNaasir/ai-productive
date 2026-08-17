import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import PomodoroTimer from '@/components/PomodoroTimer';
import { taskService } from '@/services/taskService';
import { focusService } from '@/services/focusService';

afterEach(cleanup);

// No session to recover unless a test says otherwise.
const noActive = () => vi.spyOn(focusService, 'active').mockResolvedValue(null);

describe('PomodoroTimer', () => {
  it('renders the countdown, a Start control, and loads tasks into the picker', async () => {
    vi.spyOn(taskService, 'list').mockResolvedValue([{ id: 't1', title: 'Write report' }]);
    vi.spyOn(focusService, 'stats').mockResolvedValue({ total: 0, perDay: [], perTask: [] });
    noActive();

    render(<PomodoroTimer />);

    expect(screen.getByLabelText('Time remaining')).toHaveTextContent('25:00');
    expect(screen.getByRole('button', { name: /Start/i })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: 'Write report' })).toBeInTheDocument();
  });

  it('formats today\'s tracked total', async () => {
    vi.spyOn(taskService, 'list').mockResolvedValue([]);
    vi.spyOn(focusService, 'stats').mockResolvedValue({ total: 3720, perDay: [], perTask: [] });
    noActive();

    render(<PomodoroTimer />);
    await waitFor(() => expect(screen.getByText(/Today: 1h 2m/)).toBeInTheDocument());
  });

  it('supports a custom duration', async () => {
    vi.spyOn(taskService, 'list').mockResolvedValue([]);
    vi.spyOn(focusService, 'stats').mockResolvedValue({ total: 0, perDay: [], perTask: [] });
    noActive();

    render(<PomodoroTimer />);
    const custom = screen.getByLabelText('Custom minutes');
    fireEvent.change(custom, { target: { value: '50' } });
    expect(screen.getByLabelText('Time remaining')).toHaveTextContent('50:00');
  });

  it('recovers a running session on mount', async () => {
    vi.spyOn(taskService, 'list').mockResolvedValue([]);
    vi.spyOn(focusService, 'stats').mockResolvedValue({ total: 0, perDay: [], perTask: [] });
    vi.spyOn(focusService, 'active').mockResolvedValue({
      id: 'f1',
      taskId: null,
      startedAt: new Date(Date.now() - 60 * 1000).toISOString(),
      plannedSeconds: 1500,
    });

    render(<PomodoroTimer />);

    // A recovered session shows the Pause/Stop controls, not Start.
    expect(await screen.findByRole('button', { name: /Pause/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Start$/i })).not.toBeInTheDocument();
  });

  it('pauses and resumes a running session', async () => {
    vi.spyOn(taskService, 'list').mockResolvedValue([]);
    vi.spyOn(focusService, 'stats').mockResolvedValue({ total: 0, perDay: [], perTask: [] });
    noActive();
    vi.spyOn(focusService, 'start').mockResolvedValue({ id: 's1', plannedSeconds: 1500 });

    render(<PomodoroTimer />);

    fireEvent.click(screen.getByRole('button', { name: /Start/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Pause/i }));
    expect(await screen.findByRole('button', { name: /Resume/i })).toBeInTheDocument();
  });
});
