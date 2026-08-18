'use strict';

const prisma = require('../models/prisma');
const ApiError = require('../utils/ApiError');
const { nextOccurrence } = require('../utils/recurrence');
const { getOwnedTask, getAccessibleTask } = require('../services/taskAccess');
const {
  createTaskSchema,
  updateTaskSchema,
  listTaskQuerySchema,
  shareTaskSchema,
} = require('../validators/task.schema');

// Hook invoked after a task is created/updated so embeddings can be refreshed (Phase 10).
let onTaskChanged = null;
function setTaskChangeHook(fn) {
  onTaskChanged = fn;
}

async function list(req, res) {
  const q = listTaskQuerySchema.parse(req.query);

  // Only top-level tasks appear in the list; their subtasks nest underneath.
  const where = { userId: req.user.id, parentId: null };
  if (q.status) where.status = q.status;
  if (q.priority) where.priority = q.priority;
  if (q.tag) where.tags = { has: q.tag };
  if (q.q) {
    where.OR = [
      { title: { contains: q.q, mode: 'insensitive' } },
      { description: { contains: q.q, mode: 'insensitive' } },
    ];
  }

  const tasks = await prisma.task.findMany({
    where,
    orderBy: { [q.sort]: q.order },
    include: { subtasks: { orderBy: { createdAt: 'asc' } } },
  });
  res.json({ tasks });
}

// Validate an optional parentId belongs to the current user and is itself a
// top-level task (subtasks are one level deep). Returns nothing; throws on error.
async function assertValidParent(userId, parentId) {
  if (!parentId) return;
  const parent = await getOwnedTask(userId, parentId);
  if (parent.parentId) throw ApiError.badRequest('Cannot nest a subtask under a subtask');
}

// When a recurring task is completed, spawn the next occurrence as a fresh
// PENDING task with its dueDate advanced per the recurrence rule. No-op for
// non-recurring tasks or those without a dueDate to advance.
async function maybeSpawnRecurrence(prior) {
  if (!prior || prior.recurrence === 'NONE' || !prior.dueDate) return;
  const next = nextOccurrence(prior.dueDate, prior.recurrence);
  if (!next) return;
  await prisma.task.create({
    data: {
      userId: prior.userId,
      title: prior.title,
      description: prior.description ?? null,
      priority: prior.priority,
      recurrence: prior.recurrence,
      dueDate: next,
      tags: prior.tags || [],
      status: 'PENDING',
      completedAt: null,
    },
  });
}

async function getOne(req, res) {
  // Owner or a user the task is shared with may view it.
  await getAccessibleTask(req.user.id, req.params.id);
  const task = await prisma.task.findFirst({
    where: { id: req.params.id },
    include: { subtasks: { orderBy: { createdAt: 'asc' } } },
  });
  res.json({ task });
}

async function create(req, res) {
  const data = createTaskSchema.parse(req.body);
  await assertValidParent(req.user.id, data.parentId);
  const task = await prisma.task.create({
    data: {
      ...data,
      tags: data.tags || [],
      completedAt: data.status === 'COMPLETED' ? new Date() : null,
      userId: req.user.id,
    },
  });
  if (onTaskChanged) onTaskChanged(task).catch(() => {});
  res.status(201).json({ task });
}

async function update(req, res) {
  const data = updateTaskSchema.parse(req.body);
  // Owner or a user with EDIT access may change the task.
  const prior = await getAccessibleTask(req.user.id, req.params.id, { edit: true });

  // Re-parenting is owner-only and must stay one level deep within the same user.
  // Without this an EDIT sharee could move the task under a task they own and then
  // delete that parent, destroying a task only the owner may delete (DB cascade).
  if ('parentId' in data) {
    if (prior.userId !== req.user.id) {
      throw ApiError.forbidden('Only the owner can move this task');
    }
    if (data.parentId === prior.id) {
      throw ApiError.badRequest('A task cannot be its own parent');
    }
    await assertValidParent(req.user.id, data.parentId);
    // A task that already has children cannot become a child itself — that would
    // make its subtasks two levels deep.
    if (data.parentId) {
      const childCount = await prisma.task.count({ where: { parentId: prior.id } });
      if (childCount > 0) {
        throw ApiError.badRequest('Cannot nest a task that has subtasks of its own');
      }
    }
  }

  // Snapshot the fields we need before the update — the ORM row is re-read after.
  const wasCompleted = prior.status === 'COMPLETED';
  const recurring = { recurrence: prior.recurrence, dueDate: prior.dueDate, userId: prior.userId, title: prior.title, description: prior.description, priority: prior.priority, tags: prior.tags };

  if (data.status === 'COMPLETED') {
    data.completedAt = new Date();
  } else if (data.status && data.status !== 'COMPLETED') {
    data.completedAt = null;
  }

  const task = await prisma.task.update({ where: { id: req.params.id }, data });
  if (data.status === 'COMPLETED' && !wasCompleted) {
    await maybeSpawnRecurrence(recurring);
  }
  if (onTaskChanged) onTaskChanged(task).catch(() => {});
  res.json({ task });
}

async function complete(req, res) {
  const prior = await getAccessibleTask(req.user.id, req.params.id, { edit: true });
  const wasCompleted = prior.status === 'COMPLETED';
  const recurring = { recurrence: prior.recurrence, dueDate: prior.dueDate, userId: prior.userId, title: prior.title, description: prior.description, priority: prior.priority, tags: prior.tags };
  const task = await prisma.task.update({
    where: { id: req.params.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  if (!wasCompleted) {
    await maybeSpawnRecurrence(recurring);
  }
  res.json({ task });
}

async function remove(req, res) {
  // Only the owner may delete a task.
  await getOwnedTask(req.user.id, req.params.id);
  await prisma.task.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

// Tasks shared with the current user, with each task's owner and the caller's role.
async function listShared(req, res) {
  const shares = await prisma.taskShare.findMany({ where: { userId: req.user.id } });
  const tasks = [];
  for (const s of shares) {
    const task = await prisma.task.findFirst({
      where: { id: s.taskId },
      include: { subtasks: { orderBy: { createdAt: 'asc' } } },
    });
    if (!task) continue;
    const owner = await prisma.user.findUnique({ where: { id: task.userId } });
    tasks.push({
      ...task,
      myRole: s.role,
      owner: owner ? { email: owner.email, name: owner.name } : null,
    });
  }
  res.json({ tasks });
}

// Share a task with another registered user by email (owner only).
async function share(req, res) {
  const { email, role } = shareTaskSchema.parse(req.body);
  const task = await getOwnedTask(req.user.id, req.params.id);
  const target = await prisma.user.findUnique({ where: { email } });
  if (!target) throw ApiError.notFound('No user with that email');
  if (target.id === req.user.id) throw ApiError.badRequest('You already own this task');

  const existing = await prisma.taskShare.findFirst({ where: { taskId: task.id, userId: target.id } });
  const shareRow = existing
    ? await prisma.taskShare.update({ where: { id: existing.id }, data: { role: role || 'VIEW' } })
    : await prisma.taskShare.create({ data: { taskId: task.id, userId: target.id, role: role || 'VIEW' } });

  res.status(201).json({
    share: { id: shareRow.id, taskId: task.id, userId: target.id, email: target.email, role: shareRow.role },
  });
}

async function listShares(req, res) {
  const task = await getOwnedTask(req.user.id, req.params.id);
  const shares = await prisma.taskShare.findMany({ where: { taskId: task.id } });
  const withEmail = await Promise.all(
    shares.map(async (s) => {
      const u = await prisma.user.findUnique({ where: { id: s.userId } });
      return { id: s.id, userId: s.userId, email: u?.email, role: s.role };
    })
  );
  res.json({ shares: withEmail });
}

async function unshare(req, res) {
  const task = await getOwnedTask(req.user.id, req.params.id);
  const existing = await prisma.taskShare.findFirst({ where: { taskId: task.id, userId: req.params.userId } });
  if (existing) await prisma.taskShare.delete({ where: { id: existing.id } });
  res.status(204).send();
}

module.exports = {
  list,
  getOne,
  create,
  update,
  complete,
  remove,
  listShared,
  share,
  listShares,
  unshare,
  setTaskChangeHook,
};
