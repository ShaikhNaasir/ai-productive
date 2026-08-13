'use strict';

const prisma = require('../models/prisma');
const ApiError = require('../utils/ApiError');
const { startFocusSchema } = require('../validators/focus.schema');

function dayKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

async function getOwnedSession(userId, id) {
  const session = await prisma.focusSession.findFirst({ where: { id, userId } });
  if (!session) throw ApiError.notFound('Focus session not found');
  return session;
}

// Open a focus session. An optional taskId binds it to a task (ownership checked);
// an optional startedAt records when the timer actually began.
async function start(req, res) {
  const { taskId, startedAt } = startFocusSchema.parse(req.body);
  if (taskId) {
    const task = await prisma.task.findFirst({ where: { id: taskId, userId: req.user.id } });
    if (!task) throw ApiError.notFound('Task not found');
  }
  const session = await prisma.focusSession.create({
    data: {
      userId: req.user.id,
      taskId: taskId || null,
      startedAt: startedAt || new Date(),
    },
  });
  res.status(201).json({ session });
}

// Close a session, computing elapsed seconds from the timestamps.
async function stop(req, res) {
  const prior = await getOwnedSession(req.user.id, req.params.id);
  const endedAt = new Date();
  const seconds = Math.max(0, Math.round((endedAt.getTime() - new Date(prior.startedAt).getTime()) / 1000));
  const session = await prisma.focusSession.update({
    where: { id: prior.id },
    data: { endedAt, seconds },
  });
  res.json({ session });
}

// Aggregate tracked time per task and per day (last 7 days), plus the total.
async function stats(req, res) {
  const sessions = await prisma.focusSession.findMany({ where: { userId: req.user.id } });

  const days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(dayKey(d));
  }
  const secondsByDay = Object.fromEntries(days.map((d) => [d, 0]));
  const secondsByTask = {};
  let total = 0;

  for (const s of sessions) {
    total += s.seconds;
    const key = dayKey(s.startedAt);
    if (key in secondsByDay) secondsByDay[key] += s.seconds;
    if (s.taskId) secondsByTask[s.taskId] = (secondsByTask[s.taskId] || 0) + s.seconds;
  }

  const perDay = days.map((d) => ({ date: d, seconds: secondsByDay[d] }));
  const perTask = Object.entries(secondsByTask)
    .map(([taskId, seconds]) => ({ taskId, seconds }))
    .sort((a, b) => b.seconds - a.seconds);

  res.json({ total, perDay, perTask });
}

module.exports = { start, stop, stats };
