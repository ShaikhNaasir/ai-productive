'use strict';

const prisma = require('../models/prisma');
const ApiError = require('../utils/ApiError');
const { startFocusSchema, stopFocusSchema } = require('../validators/focus.schema');

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
  const { taskId, startedAt, plannedSeconds } = startFocusSchema.parse(req.body);
  if (taskId) {
    const task = await prisma.task.findFirst({ where: { id: taskId, userId: req.user.id } });
    if (!task) throw ApiError.notFound('Task not found');
  }
  const now = new Date();
  // Tolerate client clock skew: a startedAt in the future is clamped to now so the
  // session never records negative/inflated time and start never 400s on skew.
  let started = startedAt || now;
  if (started.getTime() > now.getTime()) started = now;
  const session = await prisma.focusSession.create({
    data: {
      userId: req.user.id,
      taskId: taskId || null,
      startedAt: started,
      plannedSeconds: plannedSeconds || null,
    },
  });
  res.status(201).json({ session });
}

// The user's currently-open session (endedAt null), if any — lets the client
// recover a running timer after a reload or navigating away and back.
async function active(req, res) {
  const session = await prisma.focusSession.findFirst({
    where: { userId: req.user.id, endedAt: null },
    orderBy: { startedAt: 'desc' },
  });
  res.json({ session: session || null });
}

// Close a session. Elapsed defaults to the wall-clock span (endedAt - startedAt).
// A client may pass its own `seconds` (active time, excluding pauses); we clamp it
// to the wall-clock so it can only shorten. A planned duration further caps it, so
// an orphaned open session recovered much later can't inflate tracked time.
async function stop(req, res) {
  const { seconds: clientSeconds } = stopFocusSchema.parse(req.body || {});
  const prior = await getOwnedSession(req.user.id, req.params.id);
  const endedAt = new Date();
  const wallClock = Math.max(0, Math.round((endedAt.getTime() - new Date(prior.startedAt).getTime()) / 1000));
  let seconds = clientSeconds != null ? Math.min(clientSeconds, wallClock) : wallClock;
  if (prior.plannedSeconds != null) seconds = Math.min(seconds, prior.plannedSeconds);
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

module.exports = { start, stop, active, stats };
