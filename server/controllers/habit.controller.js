'use strict';

const prisma = require('../models/prisma');
const ApiError = require('../utils/ApiError');
const { computeStreaks, dayKey } = require('../utils/streak');
const { createHabitSchema, updateHabitSchema } = require('../validators/habit.schema');

// Normalize a date to the UTC calendar day (midnight) for a check-in row.
function utcDay(value = new Date()) {
  return new Date(`${dayKey(value)}T00:00:00.000Z`);
}

async function getOwnedHabit(userId, id) {
  const habit = await prisma.habit.findFirst({ where: { id, userId } });
  if (!habit) throw ApiError.notFound('Habit not found');
  return habit;
}

// Attach computed streaks + today's check-in flag to a habit for the client.
function decorate(habit, logs, todayKey) {
  const days = logs.map((l) => l.date);
  const { current, longest } = computeStreaks(days);
  return {
    id: habit.id,
    name: habit.name,
    description: habit.description,
    createdAt: habit.createdAt,
    updatedAt: habit.updatedAt,
    currentStreak: current,
    longestStreak: longest,
    checkedInToday: days.some((d) => dayKey(d) === todayKey),
    totalCheckIns: logs.length,
  };
}

async function list(req, res) {
  const userId = req.user.id;
  const [habits, logs] = await Promise.all([
    prisma.habit.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } }),
    prisma.habitLog.findMany({ where: { userId } }),
  ]);
  const todayKey = dayKey(new Date());
  const logsByHabit = {};
  for (const log of logs) {
    (logsByHabit[log.habitId] = logsByHabit[log.habitId] || []).push(log);
  }
  res.json({ habits: habits.map((h) => decorate(h, logsByHabit[h.id] || [], todayKey)) });
}

async function create(req, res) {
  const data = createHabitSchema.parse(req.body);
  const habit = await prisma.habit.create({
    data: { userId: req.user.id, name: data.name, description: data.description ?? null },
  });
  res.status(201).json({ habit: decorate(habit, [], dayKey(new Date())) });
}

async function update(req, res) {
  const data = updateHabitSchema.parse(req.body);
  await getOwnedHabit(req.user.id, req.params.id);
  const habit = await prisma.habit.update({ where: { id: req.params.id }, data });
  const logs = await prisma.habitLog.findMany({ where: { habitId: habit.id, userId: req.user.id } });
  res.json({ habit: decorate(habit, logs, dayKey(new Date())) });
}

async function remove(req, res) {
  await getOwnedHabit(req.user.id, req.params.id);
  // Remove logs first so the delete works regardless of DB-level cascade.
  await prisma.habitLog.deleteMany({ where: { habitId: req.params.id } });
  await prisma.habit.delete({ where: { id: req.params.id } });
  res.status(204).send();
}

// Idempotent: checking in twice on the same day is a no-op.
async function checkIn(req, res) {
  const habit = await getOwnedHabit(req.user.id, req.params.id);
  const date = utcDay();
  const existing = await prisma.habitLog.findFirst({ where: { habitId: habit.id, date } });
  if (!existing) {
    await prisma.habitLog.create({ data: { habitId: habit.id, userId: req.user.id, date } });
  }
  const logs = await prisma.habitLog.findMany({ where: { habitId: habit.id, userId: req.user.id } });
  res.json({ habit: decorate(habit, logs, dayKey(new Date())) });
}

async function uncheck(req, res) {
  const habit = await getOwnedHabit(req.user.id, req.params.id);
  const date = utcDay();
  const existing = await prisma.habitLog.findFirst({ where: { habitId: habit.id, date } });
  if (existing) await prisma.habitLog.delete({ where: { id: existing.id } });
  const logs = await prisma.habitLog.findMany({ where: { habitId: habit.id, userId: req.user.id } });
  res.json({ habit: decorate(habit, logs, dayKey(new Date())) });
}

module.exports = { list, create, update, remove, checkIn, uncheck };
