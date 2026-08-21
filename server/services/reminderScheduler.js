'use strict';

const prisma = require('../models/prisma');
const { emitToUser } = require('../realtime');
const { nextOccurrence } = require('../utils/recurrence');

let timer = null;
let running = false;

// Advance a recurrence past `now`. After downtime a chained occurrence computed
// straight from the last fire time can itself already be in the past, so the next
// tick would fire it again immediately — a week's outage on a DAILY reminder becomes
// seven notifications in a few minutes. Collapse that backlog into one upcoming
// occurrence instead. The guard bounds a pathological base date.
function nextFutureOccurrence(from, recurrence, now) {
  let next = nextOccurrence(from, recurrence);
  let guard = 0;
  while (next && next <= now && guard < 1000) {
    next = nextOccurrence(next, recurrence);
    guard += 1;
  }
  return next;
}

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
    // Mark sent BEFORE emitting: if the two overlap or the process dies between
    // them, dropping one notification beats sending it twice on the next tick.
    try {
      await prisma.reminder.update({ where: { id: reminder.id }, data: { sent: true } });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[scheduler] mark-sent failed for ${reminder.id}: ${err.message}`);
      continue;
    }

    // Persist a notification so an offline user still sees this on their next visit
    // (the socket emit below only reaches a connected client). Best-effort.
    let notificationId = reminder.id;
    try {
      const n = await prisma.notification.create({
        data: { userId: reminder.userId, type: 'reminder', message: reminder.message, refId: reminder.id },
      });
      notificationId = n.id;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[scheduler] notification persist failed for ${reminder.id}: ${err.message}`);
    }

    emitToUser(reminder.userId, 'reminder', {
      id: notificationId,
      message: reminder.message,
      remindAt: reminder.remindAt,
      taskId: reminder.taskId,
    });

    try {
      // Recurring reminder: chain the next occurrence as a fresh unsent row so
      // the persistent scheduler keeps firing it on future ticks.
      const next = nextFutureOccurrence(reminder.remindAt, reminder.recurrence, now);
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
      console.warn(`[scheduler] chaining failed for ${reminder.id}: ${err.message}`);
    }
  }
}

// Skip a tick while the previous one is still in flight. setInterval fires on a
// fixed cadence regardless of how long the async body takes, so a slow tick would
// otherwise overlap the next and re-read the same due rows.
async function guardedTick() {
  if (running) return;
  running = true;
  try {
    await tick();
  } catch {
    // A scheduler must never throw into the event loop.
  } finally {
    running = false;
  }
}

// Chained setTimeout rather than setInterval, so the gap is measured from the end
// of one run to the start of the next.
function startScheduler(intervalMs = 30000) {
  if (timer) return timer;
  const loop = () => {
    timer = setTimeout(async () => {
      await guardedTick();
      if (timer) loop();
    }, intervalMs);
    if (timer.unref) timer.unref();
  };
  loop();
  return timer;
}

function stopScheduler() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}

module.exports = { startScheduler, stopScheduler, tick, guardedTick, nextFutureOccurrence };
