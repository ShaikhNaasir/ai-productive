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
const { tick } = require('../services/reminderScheduler');

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
});
