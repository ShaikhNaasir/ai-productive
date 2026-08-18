'use strict';

const prisma = require('../models/prisma');

function dayKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

// Start of the UTC day `days` ago — the lower bound for the rolling windows below.
function windowStart(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Only the columns each aggregate actually reads. Notably never `embedding`, which
// is a 1024-dimension vector (~4KB/row) that a bare findMany would drag along.
const TASK_FIELDS = { status: true, dueDate: true, completedAt: true, tags: true };

async function summary(req, res) {
  // Focus and habit tiles are "today" only, so a short window is enough; task counts
  // are all-time by definition and stay unbounded, but are now narrowly projected.
  const since = windowStart(1);
  const [tasks, sessions, habits, habitLogs] = await Promise.all([
    prisma.task.findMany({ where: { userId: req.user.id }, select: TASK_FIELDS }),
    prisma.focusSession.findMany({
      where: { userId: req.user.id, startedAt: { gte: since } },
      select: { startedAt: true, seconds: true },
    }),
    prisma.habit.findMany({ where: { userId: req.user.id }, select: { id: true } }),
    prisma.habitLog.findMany({
      where: { userId: req.user.id, date: { gte: since } },
      select: { habitId: true, date: true },
    }),
  ]);
  const now = new Date();

  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'COMPLETED').length;
  const pending = total - completed;
  const overdue = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'COMPLETED'
  ).length;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;

  const todayKey = dayKey(now);
  const focusSecondsToday = sessions
    .filter((s) => dayKey(s.startedAt) === todayKey)
    .reduce((sum, s) => sum + s.seconds, 0);

  const habitsTotal = habits.length;
  const checkedHabitIds = new Set(
    habitLogs.filter((l) => dayKey(l.date) === todayKey).map((l) => l.habitId)
  );
  const habitsCheckedToday = checkedHabitIds.size;

  res.json({
    total,
    completed,
    pending,
    overdue,
    completionRate,
    focusSecondsToday,
    habitsTotal,
    habitsCheckedToday,
  });
}

async function trends(req, res) {
  // categoryWorkload and byStatus are all-time over every task, so this read stays
  // unbounded — but projected to the four columns actually used.
  const tasks = await prisma.task.findMany({
    where: { userId: req.user.id },
    select: TASK_FIELDS,
  });

  // Completed per day for the last 7 days.
  const days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(dayKey(d));
  }
  const completedByDay = Object.fromEntries(days.map((d) => [d, 0]));
  for (const t of tasks) {
    if (t.status === 'COMPLETED' && t.completedAt) {
      const key = dayKey(t.completedAt);
      if (key in completedByDay) completedByDay[key] += 1;
    }
  }
  const perDay = days.map((d) => ({ date: d, completed: completedByDay[d] }));

  // Category workload by tag.
  const tagCounts = {};
  for (const t of tasks) {
    for (const tag of t.tags || []) {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    }
  }
  const categoryWorkload = Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  // Status breakdown.
  const byStatus = { PENDING: 0, IN_PROGRESS: 0, COMPLETED: 0 };
  for (const t of tasks) {
    byStatus[t.status] = (byStatus[t.status] || 0) + 1;
  }

  res.json({ perDay, categoryWorkload, byStatus });
}

module.exports = { summary, trends };
