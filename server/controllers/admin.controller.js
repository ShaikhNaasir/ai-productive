'use strict';

const prisma = require('../models/prisma');
const ApiError = require('../utils/ApiError');
const { disconnectUser } = require('../realtime');
const { roleSchema, planSchema, deleteSchema } = require('../validators/admin.schema');

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

// Metadata view of a user returned by moderation actions.
function pubUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    plan: u.plan,
    planRenewsAt: u.planRenewsAt,
    lastActiveAt: u.lastActiveAt,
    createdAt: u.createdAt,
  };
}

async function loadTarget(id) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  return user;
}

async function activeAdminCount() {
  return prisma.user.count({ where: { role: 'ADMIN', status: 'ACTIVE' } });
}

// Best-effort append to the moderation trail; never blocks the action it records.
async function writeAudit(adminId, action, targetUserId, meta) {
  try {
    await prisma.adminAuditLog.create({
      data: { adminId, action, targetUserId: targetUserId || null, meta: meta || null },
    });
  } catch {
    /* audit is best-effort */
  }
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

// ---- Moderation (D3). Every mutation writes an audit row. ----

async function disableUser(req, res) {
  const target = await loadTarget(req.params.id);
  if (target.id === req.user.id) {
    throw ApiError.badRequest('You cannot disable your own account');
  }
  if (target.role === 'ADMIN' && (await activeAdminCount()) <= 1) {
    throw ApiError.badRequest('Cannot disable the last active admin');
  }
  const updated = await prisma.user.update({
    where: { id: target.id },
    // Bump tokenVersion so existing tokens die alongside the lockout.
    data: { status: 'DISABLED', tokenVersion: (target.tokenVersion ?? 0) + 1 },
  });
  disconnectUser(target.id);
  await writeAudit(req.user.id, 'user.disable', target.id, { email: target.email });
  res.json({ user: pubUser(updated) });
}

async function enableUser(req, res) {
  const target = await loadTarget(req.params.id);
  const updated = await prisma.user.update({ where: { id: target.id }, data: { status: 'ACTIVE' } });
  await writeAudit(req.user.id, 'user.enable', target.id, { email: target.email });
  res.json({ user: pubUser(updated) });
}

async function forceLogout(req, res) {
  const target = await loadTarget(req.params.id);
  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { tokenVersion: (target.tokenVersion ?? 0) + 1 },
  });
  disconnectUser(target.id);
  await writeAudit(req.user.id, 'user.force_logout', target.id, null);
  res.json({ user: pubUser(updated) });
}

async function setRole(req, res) {
  const { role } = roleSchema.parse(req.body);
  const target = await loadTarget(req.params.id);
  // Guard against locking every admin out.
  if (role === 'USER' && target.role === 'ADMIN') {
    if (target.id === req.user.id) {
      throw ApiError.badRequest('You cannot revoke your own admin role');
    }
    if ((await activeAdminCount()) <= 1) {
      throw ApiError.badRequest('Cannot revoke the last active admin');
    }
  }
  const updated = await prisma.user.update({ where: { id: target.id }, data: { role } });
  await writeAudit(req.user.id, 'user.role', target.id, { role });
  res.json({ user: pubUser(updated) });
}

async function setPlan(req, res) {
  const { plan, planRenewsAt } = planSchema.parse(req.body);
  const target = await loadTarget(req.params.id);
  const data = { plan };
  if (planRenewsAt !== undefined) {
    data.planRenewsAt = planRenewsAt ? new Date(planRenewsAt) : null;
  } else if (plan === 'FREE') {
    data.planRenewsAt = null;
  }
  const updated = await prisma.user.update({ where: { id: target.id }, data });
  await writeAudit(req.user.id, 'user.plan', target.id, { plan });
  res.json({ user: pubUser(updated) });
}

async function deleteUser(req, res) {
  const { hard } = deleteSchema.parse(req.body || {});
  const target = await loadTarget(req.params.id);
  if (target.id === req.user.id) {
    throw ApiError.badRequest('You cannot delete your own account');
  }
  if (target.role === 'ADMIN' && (await activeAdminCount()) <= 1) {
    throw ApiError.badRequest('Cannot delete the last active admin');
  }

  if (hard) {
    // Irreversible: removes the row and cascades all of the user's content.
    await prisma.user.delete({ where: { id: target.id } });
    await writeAudit(req.user.id, 'user.delete_hard', target.id, { email: target.email });
    return res.json({ deleted: true, hard: true });
  }

  // Soft delete (default): retain the row + content, but lock the account out.
  await prisma.user.update({
    where: { id: target.id },
    data: { status: 'DELETED', tokenVersion: (target.tokenVersion ?? 0) + 1 },
  });
  disconnectUser(target.id);
  await writeAudit(req.user.id, 'user.delete_soft', target.id, { email: target.email });
  return res.json({ deleted: true, hard: false });
}

async function listAudit(req, res) {
  const page = Math.max(1, parseInt(req.query.page || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10) || 50));
  const [total, logs] = await Promise.all([
    prisma.adminAuditLog.count(),
    prisma.adminAuditLog.findMany({ orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
  ]);
  res.json({ logs, page, limit, total, totalPages: Math.ceil(total / limit) });
}

module.exports = {
  metrics,
  listUsers,
  getUser,
  disableUser,
  enableUser,
  forceLogout,
  setRole,
  setPlan,
  deleteUser,
  listAudit,
};
