import { describe, it, expect } from 'vitest';
import { apiError } from '@/lib/api';

describe('apiError', () => {
  it('shows a friendly waking-up hint on 503 (cold start)', () => {
    expect(apiError({ response: { status: 503, data: {} } })).toMatch(/waking up/i);
  });

  it('returns the server-provided message for other errors', () => {
    expect(apiError({ response: { status: 400, data: { error: { message: 'Bad input' } } } })).toBe('Bad input');
  });

  it('surfaces the first field-level validation detail', () => {
    const err = {
      response: {
        status: 400,
        data: { error: { message: 'Validation failed', details: [{ path: 'startedAt', message: 'startedAt cannot be in the future' }] } },
      },
    };
    expect(apiError(err)).toBe('startedAt cannot be in the future');
  });

  it('falls back when there is no message', () => {
    expect(apiError({}, 'Custom fallback')).toBe('Custom fallback');
  });
});
