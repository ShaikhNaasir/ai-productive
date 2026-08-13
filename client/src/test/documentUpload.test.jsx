import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import Notes from '@/components/Notes';
import { noteService } from '@/services/noteService';
import { documentService } from '@/services/documentService';

afterEach(cleanup);

describe('Notes document upload', () => {
  it('uploads a document and shows the returned key points', async () => {
    vi.spyOn(noteService, 'list').mockResolvedValue([]);
    const uploadSpy = vi
      .spyOn(documentService, 'upload')
      .mockResolvedValue({ summary: 'a summary', key_points: ['first point', 'second point'] });

    render(<Notes />);

    const input = await screen.findByLabelText('Upload document');
    const file = new File(['hello world'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => expect(uploadSpy).toHaveBeenCalledWith(file));
    expect(await screen.findByText('first point')).toBeInTheDocument();
    expect(screen.getByText('a summary')).toBeInTheDocument();
  });
});
