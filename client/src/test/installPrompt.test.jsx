import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import InstallPrompt from '@/components/InstallPrompt';

afterEach(cleanup);

describe('InstallPrompt', () => {
  it('stays hidden until the browser offers installation', () => {
    render(<InstallPrompt />);
    expect(screen.queryByLabelText('Install app')).not.toBeInTheDocument();
  });

  it('shows an install button after beforeinstallprompt and prompts on click', async () => {
    render(<InstallPrompt />);

    const event = new Event('beforeinstallprompt');
    event.prompt = vi.fn();
    event.userChoice = Promise.resolve({ outcome: 'accepted' });
    fireEvent(window, event);

    const button = await screen.findByLabelText('Install app');
    fireEvent.click(button);

    expect(event.prompt).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByLabelText('Install app')).not.toBeInTheDocument());
  });
});
