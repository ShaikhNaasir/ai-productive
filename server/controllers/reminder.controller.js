'use strict';

const prisma = require('../models/prisma');
const ApiError = require('../utils/ApiError');
const {
  createReminderSchema,
  updateReminderSchema,
} = require('../validators/reminder.schema');

async function list(req, res) {
  const where = { userId: req.user.id };
  if (req.query.upcoming === 'true') {
    where.sent = false;
    where.remindAt = { gte: new Date() };
  }
  const reminders = await prisma.reminder.findMany({ where, orderBy: { remindAt: 'asc' } });
  res.json({ reminders });
}

async function getOwned(userId, id) {
  const reminder = await prisma.reminder.findFirst({ where: { id, userId } });
  if (!reminder) throw ApiError.notFound('Reminder not found');
  return reminder;
}

async function getOne(req, res) {
  res.json({ reminder: await getOwned(req.user.id, req.params.id) });
}

async function create(req, res) {
  const data = createReminderSchema.parse(req.body);
  const reminder = await prisma.reminder.create({ data: { ...data, userId: req.user.id } });
  res.status(201).json({ reminder });
}

async function update(req, res) {
  const data = updateReminderSchema.parse(req.body);
  await getOwned(req.user.id, req.params.id);
  const reminder = await prisma.reminder.update({ where: { id: req.params.id }, data });
  res.json({ reminder });
}

async function remove(req, res) {
  await getOwned(req.user.id, req.params.id);
  await prisma.reminder.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

module.exports = { list, getOne, create, update, remove };
