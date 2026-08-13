import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import HabitList from '@/components/HabitList';
import { habitService } from '@/services/habitService';

afterEach(cleanup);

describe('HabitList', () => {
  it('renders habits with their streaks and checks in on click', async () => {
    vi.spyOn(habitService, 'list').mockResolvedValue([
      { id: 'h1', name: 'Read', currentStreak: 2, longestStreak: 5, checkedInToday: false, totalCheckIns: 8 },
    ]);
    const checkInSpy = vi
      .spyOn(habitService, 'checkIn')
      .mockResolvedValue({ id: 'h1', name: 'Read', currentStreak: 3, longestStreak: 5, checkedInToday: true, totalCheckIns: 9 });

    render(<HabitList />);

    expect(await screen.findByText('Read')).toBeInTheDocument();
    expect(screen.getByText('2 days')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Check in today'));

    await waitFor(() => expect(checkInSpy).toHaveBeenCalledWith('h1'));
    expect(await screen.findByText('Done today')).toBeInTheDocument();
  });
});
