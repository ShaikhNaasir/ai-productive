import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import Calendar from '@/components/Calendar';
import { calendarService, scheduleService } from '@/services/calendarService';

afterEach(cleanup);

describe('Calendar forms (labeled UI)', () => {
  it('renders labeled event and reminder fields', async () => {
    vi.spyOn(calendarService, 'events').mockResolvedValue([]);
    render(<Calendar />);

    expect(await screen.findByLabelText('Title')).toBeInTheDocument();
    expect(screen.getByLabelText('Date & time')).toBeInTheDocument();
    expect(screen.getByLabelText('Reminder')).toBeInTheDocument();
    expect(screen.getByLabelText('Remind at')).toBeInTheDocument();
    expect(screen.getByLabelText('Repeat')).toBeInTheDocument();
  });

  it('creates an event from the labeled form', async () => {
    vi.spyOn(calendarService, 'events').mockResolvedValue([]);
    const createSpy = vi
      .spyOn(scheduleService, 'create')
      .mockResolvedValue({ id: 's1', title: 'Team standup' });

    render(<Calendar />);

    fireEvent.change(await screen.findByLabelText('Title'), { target: { value: 'Team standup' } });
    fireEvent.change(screen.getByLabelText('Date & time'), { target: { value: '2026-08-20T09:00' } });
    fireEvent.click(screen.getByRole('button', { name: /Add event/i }));

    await waitFor(() => expect(createSpy).toHaveBeenCalled());
    expect(createSpy.mock.calls[0][0].title).toBe('Team standup');
  });
});
