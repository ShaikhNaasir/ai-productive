import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function getSpeechRecognition() {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

// Mic button that captures a single spoken phrase via the Web Speech API and
// hands the transcript to onResult. Renders nothing where speech recognition is
// unsupported, so callers degrade gracefully.
export default function VoiceInput({ onResult, disabled = false }) {
  const [supported] = useState(() => Boolean(getSpeechRecognition()));
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort?.();
    };
  }, []);

  if (!supported) return null;

  const stop = () => {
    setListening(false);
    if (recognitionRef.current) {
      recognitionRef.current.stop?.();
      recognitionRef.current = null;
    }
  };

  const start = () => {
    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) return;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript?.trim();
      if (transcript) onResult?.(transcript);
    };
    recognition.onerror = stop;
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  return (
    <Button
      type="button"
      variant={listening ? 'default' : 'outline'}
      size="icon"
      onClick={listening ? stop : start}
      disabled={disabled}
      aria-label={listening ? 'Stop listening' : 'Voice input'}
      aria-pressed={listening}
    >
      {listening ? <MicOff className={cn('h-4 w-4 animate-pulse')} /> : <Mic className="h-4 w-4" />}
    </Button>
  );
}
