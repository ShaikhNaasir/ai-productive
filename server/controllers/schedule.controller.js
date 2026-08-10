'use strict';

const prisma = require('../models/prisma');
const ApiError = require('../utils/ApiError');
const {
  createScheduleSchema,
  updateScheduleSchema,
  rangeQuerySchema,
} = require('../validators/schedule.schema');

async function list(req, res) {
  const { from, to } = rangeQuerySchema.parse(req.query);
  const where = { userId: req.user.id };
  if (from || to) {
    where.startTime = {};
    if (from) where.startTime.gte = from;
    if (to) where.startTime.lte = to;
  }
  const schedules = await prisma.schedule.findMany({ where, orderBy: { startTime: 'asc' } });
  res.json({ schedules });
}

async function getOwned(userId, id) {
  const schedule = await prisma.schedule.findFirst({ where: { id, userId } });
  if (!schedule) throw ApiError.notFound('Schedule not found');
  return schedule;
}

async function getOne(req, res) {
  res.json({ schedule: await getOwned(req.user.id, req.params.id) });
}

async function create(req, res) {
  const data = createScheduleSchema.parse(req.body);
  const schedule = await prisma.schedule.create({ data: { ...data, userId: req.user.id } });
  res.status(201).json({ schedule });
}

async function update(req, res) {
  const data = updateScheduleSchema.parse(req.body);
  await getOwned(req.user.id, req.params.id);
  const schedule = await prisma.schedule.update({ where: { id: req.params.id }, data });
  res.json({ schedule });
}

async function remove(req, res) {
  await getOwned(req.user.id, req.params.id);
  await prisma.schedule.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

module.exports = { list, getOne, create, update, remove };
