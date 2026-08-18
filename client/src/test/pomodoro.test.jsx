import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react';
import PomodoroTimer from '@/components/PomodoroTimer';
import { taskService } from '@/services/taskService';
import { focusService } from '@/services/focusService';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// No session to recover unless a test says otherwise.
const noActive = () => vi.spyOn(focusService, 'active').mockResolvedValue(null);

// The mount effect fires three unawaited requests. Letting them resolve before the
// test body ends keeps their state updates inside act().
const settle = () => act(async () => { await Promise.resolve(); });

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
    await settle();
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

  it('tracks elapsed time by wall clock, not by counting interval ticks', async () => {
    // Fake only the timer functions so Date.now stays under our control, letting us
    // simulate a backgrounded tab: a minute of real time, but one throttled tick.
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    vi.spyOn(taskService, 'list').mockResolvedValue([]);
    vi.spyOn(focusService, 'stats').mockResolvedValue({ total: 0, perDay: [], perTask: [] });
    noActive();
    vi.spyOn(focusService, 'start').mockResolvedValue({ id: 's1', plannedSeconds: 1500 });

    render(<PomodoroTimer />);
    await settle();

    const realNow = Date.now();
    fireEvent.click(screen.getByRole('button', { name: /Start/i }));
    await settle();

    // 60s of wall clock passes while the tab is throttled to a single callback.
    vi.spyOn(Date, 'now').mockReturnValue(realNow + 60000);
    await act(async () => { vi.advanceTimersByTime(1000); });

    // Counting ticks would show 24:59 after one callback; the clock says 24:00.
    expect(screen.getByLabelText('Time remaining')).toHaveTextContent('24:00');
  });

  it('reports wall-clock seconds to the server when stopped', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    vi.spyOn(taskService, 'list').mockResolvedValue([]);
    vi.spyOn(focusService, 'stats').mockResolvedValue({ total: 0, perDay: [], perTask: [] });
    noActive();
    vi.spyOn(focusService, 'start').mockResolvedValue({ id: 's9', plannedSeconds: 1500 });
    const stopSpy = vi.spyOn(focusService, 'stop').mockResolvedValue({});

    render(<PomodoroTimer />);
    await settle();

    const realNow = Date.now();
    fireEvent.click(screen.getByRole('button', { name: /Start/i }));
    await settle();

    vi.spyOn(Date, 'now').mockReturnValue(realNow + 120000);
    fireEvent.click(screen.getByRole('button', { name: /Stop/i }));
    await settle();

    expect(stopSpy).toHaveBeenCalledWith('s9', 120);
  });

  it('excludes paused time from the tracked total', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
    vi.spyOn(taskService, 'list').mockResolvedValue([]);
    vi.spyOn(focusService, 'stats').mockResolvedValue({ total: 0, perDay: [], perTask: [] });
    noActive();
    vi.spyOn(focusService, 'start').mockResolvedValue({ id: 's7', plannedSeconds: 1500 });
    const stopSpy = vi.spyOn(focusService, 'stop').mockResolvedValue({});

    const realNow = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(realNow);

    render(<PomodoroTimer />);
    await settle();
    fireEvent.click(screen.getByRole('button', { name: /Start/i }));
    await settle();

    // 30s of work, then paused for 300s, then 10s more.
    nowSpy.mockReturnValue(realNow + 30000);
    fireEvent.click(screen.getByRole('button', { name: /Pause/i }));
    await settle();

    nowSpy.mockReturnValue(realNow + 330000);
    fireEvent.click(screen.getByRole('button', { name: /Resume/i }));
    await settle();

    nowSpy.mockReturnValue(realNow + 340000);
    fireEvent.click(screen.getByRole('button', { name: /Stop/i }));
    await settle();

    // 30 + 10 active seconds; the 300s pause is not counted.
    expect(stopSpy).toHaveBeenCalledWith('s7', 40);
  });
});
