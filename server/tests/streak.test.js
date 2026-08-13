'use strict';

const { computeStreaks } = require('../utils/streak');

describe('computeStreaks', () => {
  const today = new Date('2026-08-13T12:00:00.000Z');

  test('no check-ins returns zero', () => {
    expect(computeStreaks([], today)).toEqual({ current: 0, longest: 0 });
  });

  test('checked in today gives a current streak of 1', () => {
    expect(computeStreaks(['2026-08-13'], today)).toEqual({ current: 1, longest: 1 });
  });

  test('consecutive days ending today', () => {
    const days = ['2026-08-11', '2026-08-12', '2026-08-13'];
    expect(computeStreaks(days, today)).toEqual({ current: 3, longest: 3 });
  });

  test('ending yesterday still counts as current (today not yet checked)', () => {
    const days = ['2026-08-11', '2026-08-12'];
    expect(computeStreaks(days, today)).toEqual({ current: 2, longest: 2 });
  });

  test('a gap breaks the current streak but longest is preserved', () => {
    // Aug 5-7 is a run of 3; then a gap; only today checked -> current 1, longest 3.
    const days = ['2026-08-05', '2026-08-06', '2026-08-07', '2026-08-13'];
    expect(computeStreaks(days, today)).toEqual({ current: 1, longest: 3 });
  });

  test('current is zero when neither today nor yesterday is checked', () => {
    const days = ['2026-08-01', '2026-08-02'];
    expect(computeStreaks(days, today)).toEqual({ current: 0, longest: 2 });
  });

  test('duplicate days are de-duplicated', () => {
    const days = ['2026-08-13', '2026-08-13', '2026-08-12'];
    expect(computeStreaks(days, today)).toEqual({ current: 2, longest: 2 });
  });

  test('accepts Date objects as well as day strings', () => {
    const days = [new Date('2026-08-12T00:00:00.000Z'), new Date('2026-08-13T00:00:00.000Z')];
    expect(computeStreaks(days, today)).toEqual({ current: 2, longest: 2 });
  });
});
