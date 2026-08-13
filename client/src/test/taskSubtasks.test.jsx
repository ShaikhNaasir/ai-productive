import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import TaskList from '@/components/TaskList';
import { taskService } from '@/services/taskService';

afterEach(cleanup);

describe('TaskList subtasks', () => {
  it('shows an AI Break Down action and reveals nested subtasks on expand', async () => {
    vi.spyOn(taskService, 'list').mockResolvedValue([
      {
        id: 'p1',
        title: 'Ship feature',
        priority: 'HIGH',
        status: 'PENDING',
        recurrence: 'NONE',
        tags: [],
        subtasks: [
          { id: 's1', title: 'Write tests', status: 'PENDING' },
          { id: 's2', title: 'Open PR', status: 'PENDING' },
        ],
      },
    ]);

    render(<TaskList />);

    // AI Break Down action is available per task.
    expect(await screen.findAllByLabelText('AI Break Down')).toHaveLength(1);

    // Subtasks are collapsed initially, revealed after expanding.
    expect(screen.queryByText('Write tests')).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Expand subtasks'));
    expect(screen.getByText('Write tests')).toBeInTheDocument();
    expect(screen.getByText('Open PR')).toBeInTheDocument();
  });
});
