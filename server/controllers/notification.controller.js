'use strict';

const prisma = require('../models/prisma');
const ApiError = require('../utils/ApiError');

const DAY = 24 * 60 * 60 * 1000;

// Recent notifications for the current user (last 30 days, capped), plus the unread
// count for the bell badge. This is the catch-up path: reminders that fired while
// the user was offline are surfaced here on their next visit.
async function list(req, res) {
  const userId = req.user.id;
  const since = new Date(Date.now() - 30 * DAY);

  const [notifications, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId, createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);

  res.json({ notifications, unread });
}

async function markAllRead(req, res) {
  await prisma.notification.updateMany({
    where: { userId: req.user.id, readAt: null },
    data: { readAt: new Date() },
  });
  res.json({ success: true });
}

async function markRead(req, res) {
  const existing = await prisma.notification.findFirst({
    where: { id: req.params.id, userId: req.user.id },
  });
  if (!existing) {
    throw ApiError.notFound('Notification not found');
  }
  const notification = await prisma.notification.update({
    where: { id: existing.id },
    data: { readAt: existing.readAt || new Date() },
  });
  res.json({ notification });
}

module.exports = { list, markAllRead, markRead };
