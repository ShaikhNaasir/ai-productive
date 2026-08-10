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
});
