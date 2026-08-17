import { describe, it, expect } from 'vitest';
import { apiError } from '@/lib/api';

describe('apiError', () => {
  it('shows a friendly waking-up hint on 503 (cold start)', () => {
    expect(apiError({ response: { status: 503, data: {} } })).toMatch(/waking up/i);
  });

  it('returns the server-provided message for other errors', () => {
    expect(apiError({ response: { status: 400, data: { error: { message: 'Bad input' } } } })).toBe('Bad input');
  });

  it('falls back when there is no message', () => {
    expect(apiError({}, 'Custom fallback')).toBe('Custom fallback');
  });
});
