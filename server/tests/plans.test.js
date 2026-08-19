'use strict';

const { limitsFor, isPaid, effectivePlan } = require('../config/plans');

describe('plan entitlements', () => {
  test('limitsFor falls back to FREE for an unknown plan', () => {
    expect(limitsFor('WAT')).toEqual(limitsFor('FREE'));
    expect(limitsFor('PAID').tasks).toBe(Infinity);
    expect(limitsFor('FREE').tasks).toBeLessThan(limitsFor('PAID').tasks);
  });

  test('isPaid: PAID with a future renewal is paid', () => {
    const future = new Date(Date.now() + 86400000);
    expect(isPaid({ plan: 'PAID', planRenewsAt: future })).toBe(true);
  });

  test('isPaid: PAID with no renewal date is an open-ended grant', () => {
    expect(isPaid({ plan: 'PAID', planRenewsAt: null })).toBe(true);
  });

  test('isPaid: PAID but expired counts as not paid (runtime belt)', () => {
    const past = new Date(Date.now() - 86400000);
    expect(isPaid({ plan: 'PAID', planRenewsAt: past })).toBe(false);
  });

  test('isPaid: FREE is never paid', () => {
    expect(isPaid({ plan: 'FREE', planRenewsAt: null })).toBe(false);
    expect(isPaid(null)).toBe(false);
  });

  test('effectivePlan downgrades an expired PAID user to FREE', () => {
    const past = new Date(Date.now() - 1000);
    expect(effectivePlan({ plan: 'PAID', planRenewsAt: past })).toBe('FREE');
    expect(effectivePlan({ plan: 'PAID', planRenewsAt: new Date(Date.now() + 1000) })).toBe('PAID');
  });
});
