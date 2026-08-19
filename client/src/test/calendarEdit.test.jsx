import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import Calendar from '@/components/Calendar';
import { calendarService, scheduleService, reminderService } from '@/services/calendarService';

const scheduleEvent = { type: 'schedule', id: 's1', title: 'Standup', date: '2026-08-20T09:00:00Z', meta: {} };
const reminderEvent = { type: 'reminder', id: 'r1', title: 'Call dentist', date: '2026-08-21T10:00:00Z', meta: { recurrence: 'NONE' } };

beforeEach(() => {
  vi.spyOn(calendarService, 'events').mockResolvedValue([scheduleEvent, reminderEvent]);
});
afterEach(cleanup);

describe('Calendar edit/delete (hardening)', () => {
  it('edits a schedule via the inline form', async () => {
    const update = vi.spyOn(scheduleService, 'update').mockResolvedValue({});
    render(<Calendar />);

    fireEvent.click(await screen.findByRole('button', { name: /Edit schedule/i }));
    const title = screen.getByDisplayValue('Standup');
    fireEvent.change(title, { target: { value: 'Standup (moved)' } });
    fireEvent.click(screen.getByRole('button', { name: /^Save$/i }));

    await waitFor(() => expect(update).toHaveBeenCalledWith('s1', expect.objectContaining({ title: 'Standup (moved)' })));
  });

  it('deletes a reminder after confirmation', async () => {
    const remove = vi.spyOn(reminderService, 'remove').mockResolvedValue({});
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Calendar />);

    fireEvent.click(await screen.findByRole('button', { name: /Delete reminder/i }));

    await waitFor(() => expect(remove).toHaveBeenCalledWith('r1'));
  });
});
