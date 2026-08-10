'use strict';

const prisma = require('../models/prisma');
const ApiError = require('../utils/ApiError');
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

  const where = { userId: req.user.id };
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
  });
  res.json({ tasks });
}

async function getOwnedTask(userId, id) {
  const task = await prisma.task.findFirst({ where: { id, userId } });
  if (!task) throw ApiError.notFound('Task not found');
  return task;
}

async function getOne(req, res) {
  const task = await getOwnedTask(req.user.id, req.params.id);
  res.json({ task });
}

async function create(req, res) {
  const data = createTaskSchema.parse(req.body);
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
  await getOwnedTask(req.user.id, req.params.id);

  if (data.status === 'COMPLETED') {
    data.completedAt = new Date();
  } else if (data.status && data.status !== 'COMPLETED') {
    data.completedAt = null;
  }

  const task = await prisma.task.update({ where: { id: req.params.id }, data });
  if (onTaskChanged) onTaskChanged(task).catch(() => {});
  res.json({ task });
}

async function complete(req, res) {
  await getOwnedTask(req.user.id, req.params.id);
  const task = await prisma.task.update({
    where: { id: req.params.id },
    data: { status: 'COMPLETED', completedAt: new Date() },
  });
  res.json({ task });
}

async function remove(req, res) {
  await getOwnedTask(req.user.id, req.params.id);
  await prisma.task.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

module.exports = { list, getOne, create, update, complete, remove, setTaskChangeHook };
