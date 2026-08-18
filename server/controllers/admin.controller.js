'use strict';

const prisma = require('../models/prisma');
const ApiError = require('../utils/ApiError');

const DAY = 24 * 60 * 60 * 1000;

// IMPORTANT: every handler here returns metadata + aggregate counts only. It must
// never select or return a user's private content (task titles, note bodies, etc.).

function since(days) {
  return new Date(Date.now() - days * DAY);
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function round4(n) {
  return Number((n || 0).toFixed(4));
}

// System-wide dashboard numbers.
async function metrics(req, res) {
  const [
    total,
    new7d,
    new30d,
    activeToday,
    disabled,
    free,
    paid,
    tasks,
    notes,
    habits,
    schedules,
    reminders,
    focusSessions,
    ai,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: since(7) } } }),
    prisma.user.count({ where: { createdAt: { gte: since(30) } } }),
    prisma.user.count({ where: { lastActiveAt: { gte: startOfToday() } } }),
    prisma.user.count({ where: { status: 'DISABLED' } }),
    prisma.user.count({ where: { plan: 'FREE' } }),
    prisma.user.count({ where: { plan: 'PAID' } }),
    prisma.task.count(),
    prisma.note.count(),
    prisma.habit.count(),
    prisma.schedule.count(),
    prisma.reminder.count(),
    prisma.focusSession.count(),
    prisma.aiUsage.aggregate({ _count: true, _sum: { costUsd: true, inputTokens: true, outputTokens: true } }),
  ]);

  res.json({
    users: { total, new7d, new30d, activeToday, disabled },
    plans: { free, paid },
    content: { tasks, notes, habits, schedules, reminders, focusSessions },
    ai: {
      calls: ai._count || 0,
      costUsd: round4(ai._sum?.costUsd),
      inputTokens: ai._sum?.inputTokens || 0,
      outputTokens: ai._sum?.outputTokens || 0,
    },
  });
}

// Paginated user list — metadata only, filterable by search/role/status/plan.
async function listUsers(req, res) {
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10) || 25));

  const where = {};
  if (req.query.status) where.status = req.query.status;
  if (req.query.plan) where.plan = req.query.plan;
  if (req.query.role) where.role = req.query.role;
  if (req.query.search) {
    where.OR = [
      { email: { contains: req.query.search, mode: 'insensitive' } },
      { name: { contains: req.query.search, mode: 'insensitive' } },
    ];
  }

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      // Metadata projection — deliberately no content-bearing relations.
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        plan: true,
        createdAt: true,
        lastActiveAt: true,
      },
    }),
  ]);

  res.json({ users, page, limit, total, totalPages: Math.ceil(total / limit) });
}

// One user's metadata + aggregate activity. Still no private content.
async function getUser(req, res) {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const [tasks, notes, habits, schedules, reminders, focusSessions, ai] = await Promise.all([
    prisma.task.count({ where: { userId: user.id } }),
    prisma.note.count({ where: { userId: user.id } }),
    prisma.habit.count({ where: { userId: user.id } }),
    prisma.schedule.count({ where: { userId: user.id } }),
    prisma.reminder.count({ where: { userId: user.id } }),
    prisma.focusSession.count({ where: { userId: user.id } }),
    prisma.aiUsage.aggregate({
      where: { userId: user.id },
      _count: true,
      _sum: { costUsd: true, inputTokens: true, outputTokens: true },
    }),
  ]);

  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      status: user.status,
      plan: user.plan,
      planRenewsAt: user.planRenewsAt,
      createdAt: user.createdAt,
      lastActiveAt: user.lastActiveAt,
    },
    counts: { tasks, notes, habits, schedules, reminders, focusSessions },
    ai: {
      calls: ai._count || 0,
      costUsd: round4(ai._sum?.costUsd),
      inputTokens: ai._sum?.inputTokens || 0,
      outputTokens: ai._sum?.outputTokens || 0,
    },
  });
}

module.exports = { metrics, listUsers, getUser };
