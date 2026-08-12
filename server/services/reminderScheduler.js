'use strict';

const prisma = require('../models/prisma');
const { emitToUser } = require('../realtime');
const { nextOccurrence } = require('../utils/recurrence');

let timer = null;

// Poll for due, unsent reminders, push them over Socket.IO, and mark them sent.
// Persistent (DB-backed) so restarts don't drop reminders — a due reminder is
// still unsent and will fire on the next tick.
async function tick() {
  const now = new Date();
  let due = [];
  try {
    due = await prisma.reminder.findMany({
      where: { sent: false, remindAt: { lte: now } },
      take: 100,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[scheduler] query failed: ${err.message}`);
    return;
  }

  for (const reminder of due) {
    emitToUser(reminder.userId, 'reminder', {
      id: reminder.id,
      message: reminder.message,
      remindAt: reminder.remindAt,
      taskId: reminder.taskId,
    });
    try {
      await prisma.reminder.update({ where: { id: reminder.id }, data: { sent: true } });
      // Recurring reminder: chain the next occurrence as a fresh unsent row so
      // the persistent scheduler keeps firing it on future ticks.
      const next = nextOccurrence(reminder.remindAt, reminder.recurrence);
      if (next) {
        await prisma.reminder.create({
          data: {
            userId: reminder.userId,
            message: reminder.message,
            remindAt: next,
            recurrence: reminder.recurrence,
            taskId: reminder.taskId ?? null,
            sent: false,
          },
        });
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[scheduler] mark-sent failed for ${reminder.id}: ${err.message}`);
    }
  }
}

function startScheduler(intervalMs = 30000) {
  if (timer) return timer;
  timer = setInterval(() => {
    tick().catch(() => {});
  }, intervalMs);
  if (timer.unref) timer.unref();
  return timer;
}

function stopScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

module.exports = { startScheduler, stopScheduler, tick };
