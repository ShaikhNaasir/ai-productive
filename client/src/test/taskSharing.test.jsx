import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import TaskList from '@/components/TaskList';
import { taskService } from '@/services/taskService';

afterEach(cleanup);

describe('TaskList sharing', () => {
  it('opens the share dialog and shares a task by email', async () => {
    vi.spyOn(taskService, 'list').mockResolvedValue([
      { id: 't1', title: 'Owned task', priority: 'MEDIUM', status: 'PENDING', recurrence: 'NONE', tags: [] },
    ]);
    vi.spyOn(taskService, 'listShares').mockResolvedValue([]);
    const shareSpy = vi
      .spyOn(taskService, 'share')
      .mockResolvedValue({ id: 's1', email: 'friend@b.com', role: 'EDIT', userId: 'u2' });

    render(<TaskList />);

    fireEvent.click(await screen.findByLabelText('Share task'));
    const email = await screen.findByLabelText('Share email');
    fireEvent.change(email, { target: { value: 'friend@b.com' } });
    fireEvent.change(screen.getByLabelText('Share role'), { target: { value: 'EDIT' } });
    fireEvent.click(screen.getByRole('button', { name: /^Share$/i }));

    await waitFor(() =>
      expect(shareSpy).toHaveBeenCalledWith('t1', { email: 'friend@b.com', role: 'EDIT' })
    );
  });

  it('shows shared-with-me tasks read-only for the VIEW role', async () => {
    vi.spyOn(taskService, 'list').mockResolvedValue([]);
    vi.spyOn(taskService, 'listShared').mockResolvedValue([
      {
        id: 's1',
        title: 'Shared with me',
        priority: 'HIGH',
        status: 'PENDING',
        recurrence: 'NONE',
        tags: [],
        myRole: 'VIEW',
        owner: { email: 'owner@b.com', name: 'Owner' },
      },
    ]);

    render(<TaskList />);
    fireEvent.click(screen.getByRole('button', { name: 'SHARED' }));

    expect(await screen.findByText('Shared with me')).toBeInTheDocument();
    expect(screen.getByText('from owner@b.com')).toBeInTheDocument();
    expect(screen.getByText('View only')).toBeInTheDocument();
    // Read-only: no edit/delete/status controls for a VIEW share.
    expect(screen.queryByLabelText('Edit')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Delete')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Task status')).not.toBeInTheDocument();
  });
});
