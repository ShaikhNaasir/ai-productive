'use strict';

const prisma = require('../models/prisma');

function dayKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

async function summary(req, res) {
  const tasks = await prisma.task.findMany({ where: { userId: req.user.id } });
  const now = new Date();

  const total = tasks.length;
  const completed = tasks.filter((t) => t.status === 'COMPLETED').length;
  const pending = total - completed;
  const overdue = tasks.filter(
    (t) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'COMPLETED'
  ).length;
  const completionRate = total ? Math.round((completed / total) * 100) : 0;

  res.json({ total, completed, pending, overdue, completionRate });
}

async function trends(req, res) {
  const tasks = await prisma.task.findMany({ where: { userId: req.user.id } });

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
