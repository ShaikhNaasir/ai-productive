'use strict';

const prisma = require('../models/prisma');
const ApiError = require('../utils/ApiError');
const { nextOccurrence } = require('../utils/recurrence');
const {
  createTaskSchema,
  updateTaskSchema,
  listTaskQuerySchema,
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

async function getOwnedTask(userId, id) {
  const task = await prisma.task.findFirst({ where: { id, userId } });
  if (!task) throw ApiError.notFound('Task not found');
  return task;
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
  await getOwnedTask(req.user.id, req.params.id);
  const task = await prisma.task.findFirst({
    where: { id: req.params.id, userId: req.user.id },
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
  const prior = await getOwnedTask(req.user.id, req.params.id);
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
  const prior = await getOwnedTask(req.user.id, req.params.id);
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
  await getOwnedTask(req.user.id, req.params.id);
  await prisma.task.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

module.exports = { list, getOne, create, update, complete, remove, setTaskChangeHook };
