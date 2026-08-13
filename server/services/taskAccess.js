'use strict';

const prisma = require('../models/prisma');
const ApiError = require('../utils/ApiError');

// Task authorization helpers shared by the task and AI controllers.
// A user may act on a task if they own it or it has been shared with them
// (Roadmap C2). Subtasks inherit access from their parent's shares.

async function getOwnedTask(userId, id) {
  const task = await prisma.task.findFirst({ where: { id, userId } });
  if (!task) throw ApiError.notFound('Task not found');
  return task;
}

async function findShare(userId, taskId) {
  return prisma.taskShare.findFirst({ where: { taskId, userId } });
}

// Return the task if the user owns it or has a share on it (or on its parent).
// With { edit: true }, a shared user must hold the EDIT role. Throws 404 for no
// access (so a non-shared task is indistinguishable from a missing one).
async function getAccessibleTask(userId, id, { edit = false } = {}) {
  const task = await prisma.task.findFirst({ where: { id } });
  if (!task) throw ApiError.notFound('Task not found');
  if (task.userId === userId) return task;

  const share =
    (await findShare(userId, task.id)) ||
    (task.parentId ? await findShare(userId, task.parentId) : null);
  if (!share) throw ApiError.notFound('Task not found');
  if (edit && share.role !== 'EDIT') {
    throw ApiError.forbidden('You have view-only access to this task');
  }
  return task;
}

module.exports = { getOwnedTask, getAccessibleTask, findShare };
