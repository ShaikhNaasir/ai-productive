import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import TaskList from '@/components/TaskList';
import { taskService } from '@/services/taskService';

afterEach(cleanup);

describe('TaskList recurrence', () => {
  it('renders a repeat control with recurrence options', async () => {
    vi.spyOn(taskService, 'list').mockResolvedValue([]);
    render(<TaskList />);
    const repeat = await screen.findByLabelText('Repeat');
    expect(repeat).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'No repeat' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'WEEKLY' })).toBeInTheDocument();
  });
});
