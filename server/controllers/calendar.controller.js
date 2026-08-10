'use strict';

const prisma = require('../models/prisma');
const { rangeQuerySchema } = require('../validators/schedule.schema');

// Aggregates tasks (by dueDate), schedules (by startTime), and reminders (by remindAt)
// into a single calendar feed for the requested window.
async function calendar(req, res) {
  const { from, to } = rangeQuerySchema.parse(req.query);
  const userId = req.user.id;

  const range = (field) => {
    if (!from && !to) return undefined;
    const r = {};
    if (from) r.gte = from;
    if (to) r.lte = to;
    return { [field]: r };
  };

  const [tasks, schedules, reminders] = await Promise.all([
    prisma.task.findMany({
      where: { userId, dueDate: { not: null }, ...(range('dueDate') || {}) },
    }),
    prisma.schedule.findMany({ where: { userId, ...(range('startTime') || {}) } }),
    prisma.reminder.findMany({ where: { userId, ...(range('remindAt') || {}) } }),
  ]);

  const events = [
    ...tasks.map((t) => ({ type: 'task', id: t.id, title: t.title, date: t.dueDate, meta: { priority: t.priority, status: t.status } })),
    ...schedules.map((s) => ({ type: 'schedule', id: s.id, title: s.title, date: s.startTime, meta: { endTime: s.endTime, location: s.location } })),
    ...reminders.map((r) => ({ type: 'reminder', id: r.id, title: r.message, date: r.remindAt, meta: { sent: r.sent } })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));

  res.json({ events });
}

module.exports = { calendar };
