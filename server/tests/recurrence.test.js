'use strict';

const { nextOccurrence } = require('../utils/recurrence');

describe('nextOccurrence', () => {
  const base = new Date('2026-08-12T09:30:00.000Z');

  test('NONE / missing rule returns null', () => {
    expect(nextOccurrence(base, 'NONE')).toBeNull();
    expect(nextOccurrence(base, undefined)).toBeNull();
    expect(nextOccurrence(null, 'DAILY')).toBeNull();
  });

  test('unknown rule returns null', () => {
    expect(nextOccurrence(base, 'YEARLY')).toBeNull();
  });

  test('DAILY advances by one day, preserving time', () => {
    expect(nextOccurrence(base, 'DAILY').toISOString()).toBe('2026-08-13T09:30:00.000Z');
  });

  test('WEEKLY advances by seven days', () => {
    expect(nextOccurrence(base, 'WEEKLY').toISOString()).toBe('2026-08-19T09:30:00.000Z');
  });

  test('MONTHLY advances by one month', () => {
    expect(nextOccurrence(base, 'MONTHLY').toISOString()).toBe('2026-09-12T09:30:00.000Z');
  });

  test('MONTHLY clamps day-of-month (Jan 31 -> Feb 28 in a non-leap year)', () => {
    const jan31 = new Date('2026-01-31T00:00:00.000Z');
    expect(nextOccurrence(jan31, 'MONTHLY').toISOString()).toBe('2026-02-28T00:00:00.000Z');
  });

  test('MONTHLY clamps to Feb 29 in a leap year', () => {
    const jan31 = new Date('2024-01-31T00:00:00.000Z');
    expect(nextOccurrence(jan31, 'MONTHLY').toISOString()).toBe('2024-02-29T00:00:00.000Z');
  });

  test('does not mutate the input date', () => {
    const input = new Date('2026-08-12T09:30:00.000Z');
    nextOccurrence(input, 'DAILY');
    expect(input.toISOString()).toBe('2026-08-12T09:30:00.000Z');
  });
});
