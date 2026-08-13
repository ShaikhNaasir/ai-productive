import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import VoiceInput from '@/components/VoiceInput';

// Fake SpeechRecognition capturing the last constructed instance so tests can
// drive its event handlers.
let lastRecognition;
class FakeRecognition {
  constructor() {
    this.start = vi.fn();
    this.stop = vi.fn();
    this.abort = vi.fn();
    lastRecognition = this;
  }
}

afterEach(() => {
  cleanup();
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
  lastRecognition = undefined;
});

describe('VoiceInput', () => {
  it('renders nothing when speech recognition is unsupported', () => {
    const { container } = render(<VoiceInput onResult={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('starts recognition and forwards the transcript to onResult', () => {
    window.SpeechRecognition = FakeRecognition;
    const onResult = vi.fn();

    render(<VoiceInput onResult={onResult} />);

    const button = screen.getByLabelText('Voice input');
    fireEvent.click(button);

    expect(lastRecognition.start).toHaveBeenCalled();
    expect(screen.getByLabelText('Stop listening')).toBeInTheDocument();

    // Simulate a recognition result.
    lastRecognition.onresult({ results: [[{ transcript: 'Call the dentist tomorrow' }]] });
    expect(onResult).toHaveBeenCalledWith('Call the dentist tomorrow');
  });

  it('falls back to the webkit-prefixed API', () => {
    window.webkitSpeechRecognition = FakeRecognition;
    render(<VoiceInput onResult={() => {}} />);
    expect(screen.getByLabelText('Voice input')).toBeInTheDocument();
  });
});
