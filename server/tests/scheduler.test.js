'use strict';

jest.mock('../models/prisma', () => {
  const { createFakePrisma } = require('./helpers/fakePrisma');
  return createFakePrisma();
});

jest.mock('../realtime', () => ({
  emitToUser: jest.fn(),
  attachRealtime: jest.fn(),
  getIo: () => null,
}));

const prisma = require('../models/prisma');
const { emitToUser } = require('../realtime');
const { tick, guardedTick, nextFutureOccurrence } = require('../services/reminderScheduler');

describe('reminder scheduler', () => {
  test('emits due reminders and marks them sent', async () => {
    const past = new Date(Date.now() - 60000);
    const future = new Date(Date.now() + 3600000);

    const due = await prisma.reminder.create({ data: { userId: 'u1', message: 'ping', remindAt: past } });
    await prisma.reminder.create({ data: { userId: 'u1', message: 'later', remindAt: future } });

    await tick();

    expect(emitToUser).toHaveBeenCalledTimes(1);
    expect(emitToUser).toHaveBeenCalledWith('u1', 'reminder', expect.objectContaining({ message: 'ping' }));

    const updated = await prisma.reminder.findUnique({ where: { id: due.id } });
    expect(updated.sent).toBe(true);
  });

  test('does not re-emit already-sent reminders', async () => {
    // clearMocks resets call history; the previously-due reminder is now sent,
    // so this tick should emit nothing.
    await tick();
    expect(emitToUser).toHaveBeenCalledTimes(0);
  });

  test('chains the next occurrence for a recurring reminder', async () => {
    const past = new Date(Date.now() - 60000);
    const rec = await prisma.reminder.create({
      data: { userId: 'u2', message: 'daily-standup', remindAt: past, recurrence: 'DAILY' },
    });

    await tick();

    const updated = await prisma.reminder.findUnique({ where: { id: rec.id } });
    expect(updated.sent).toBe(true);

    const all = await prisma.reminder.findMany({ where: { userId: 'u2', message: 'daily-standup' } });
    expect(all.length).toBe(2);
    const chained = all.find((r) => !r.sent);
    expect(chained).toBeTruthy();
    expect(chained.recurrence).toBe('DAILY');
    expect(new Date(chained.remindAt).getTime()).toBe(past.getTime() + 86400000);
  });

  test('does not chain a non-recurring reminder', async () => {
    const past = new Date(Date.now() - 60000);
    await prisma.reminder.create({
      data: { userId: 'u3', message: 'one-shot', remindAt: past },
    });

    await tick();

    const all = await prisma.reminder.findMany({ where: { userId: 'u3', message: 'one-shot' } });
    expect(all.length).toBe(1);
    expect(all[0].sent).toBe(true);
  });

  test('an overdue recurring reminder fires once and chains a single future occurrence', async () => {
    // Five days of downtime: chaining straight from remindAt would land in the past
    // and re-fire on every subsequent tick until it caught up.
    const fiveDaysAgo = new Date(Date.now() - 5 * 86400000);
    await prisma.reminder.create({
      data: { userId: 'u4', message: 'backlog', remindAt: fiveDaysAgo, recurrence: 'DAILY' },
    });

    await tick();
    expect(emitToUser).toHaveBeenCalledTimes(1);

    const all = await prisma.reminder.findMany({ where: { userId: 'u4', message: 'backlog' } });
    expect(all.length).toBe(2);
    const chained = all.find((r) => !r.sent);
    expect(new Date(chained.remindAt).getTime()).toBeGreaterThan(Date.now());

    // A second tick finds nothing due, so no duplicate burst.
    await tick();
    expect(emitToUser).toHaveBeenCalledTimes(1);
    const after = await prisma.reminder.findMany({ where: { userId: 'u4', message: 'backlog' } });
    expect(after.length).toBe(2);
  });

  test('nextFutureOccurrence advances past now and preserves time-of-day', () => {
    const now = new Date('2026-08-17T12:00:00Z');
    const base = new Date('2026-08-10T09:30:00Z');
    const next = nextFutureOccurrence(base, 'DAILY', now);
    expect(next.toISOString()).toBe('2026-08-18T09:30:00.000Z');
  });

  test('nextFutureOccurrence returns null for a non-recurring reminder', () => {
    expect(nextFutureOccurrence(new Date(), 'NONE', new Date())).toBeNull();
  });

  test('guardedTick skips a run while the previous one is still in flight', async () => {
    const past = new Date(Date.now() - 60000);
    await prisma.reminder.create({ data: { userId: 'u5', message: 'overlap', remindAt: past } });

    // Stall the first tick mid-query so the second one overlaps it.
    const original = prisma.reminder.findMany;
    let release;
    const gate = new Promise((r) => { release = r; });
    let calls = 0;
    prisma.reminder.findMany = async (args) => {
      calls += 1;
      if (calls === 1) await gate;
      return original(args);
    };

    const first = guardedTick();
    const second = guardedTick(); // must return immediately without querying
    await second;
    expect(calls).toBe(1);

    release();
    await first;
    prisma.reminder.findMany = original;

    // Exactly one emit despite two overlapping invocations.
    expect(emitToUser).toHaveBeenCalledTimes(1);
  });
});
