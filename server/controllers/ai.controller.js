'use strict';

const { z } = require('zod');
const prisma = require('../models/prisma');
const aiClient = require('../services/aiClient');
const ApiError = require('../utils/ApiError');
const config = require('../config/env');
const embeddingService = require('../services/embeddingService');
const { getAccessibleTask } = require('../services/taskAccess');

const textSchema = z.object({ text: z.string().trim().min(1) });
const summarizeSchema = z.object({
  text: z.string().trim().min(1).optional(),
  noteId: z.string().uuid().optional(),
});
const chatSchema = z.object({
  message: z.string().trim().min(1),
  history: z.array(z.object({ role: z.string(), content: z.string() })).optional(),
});
// AI breakdown output is validated before persisting subtasks.
const breakdownSchema = z.object({
  subtasks: z.array(z.string().trim().min(1).max(300)).max(7),
});
// Proposed day-plan blocks are validated before persisting as schedule entries.
const planBlockSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    startTime: z.coerce.date(),
    endTime: z.coerce.date().optional().nullable(),
    reason: z.string().max(5000).optional().nullable(),
  })
  .refine((b) => !b.endTime || b.endTime >= b.startTime, {
    message: 'endTime must be after startTime',
    path: ['endTime'],
  });
const acceptPlanSchema = z.object({ blocks: z.array(planBlockSchema).min(1).max(20) });

// Parse a natural-language instruction into a structured task (no persistence).
async function parseTask(req, res) {
  const { text } = textSchema.parse(req.body);
  const parsed = await aiClient.parseTask(text, new Date().toISOString());
  res.json({ task: parsed });
}

// NL task creation, end-to-end: parse then persist for the current user.
async function createTaskFromText(req, res) {
  const { text } = textSchema.parse(req.body);
  const parsed = await aiClient.parseTask(text, new Date().toISOString());

  const task = await prisma.task.create({
    data: {
      userId: req.user.id,
      title: parsed.title,
      description: parsed.description || null,
      priority: parsed.priority || 'MEDIUM',
      dueDate: parsed.dueDate ? new Date(parsed.dueDate) : null,
      tags: Array.isArray(parsed.tags) ? parsed.tags : [],
    },
  });
  res.status(201).json({ task, parsed });
}

// Break one task into AI-generated subtasks and persist them as child tasks.
async function breakdownTask(req, res) {
  // Owner or an EDIT-shared user may break a task down.
  const task = await getAccessibleTask(req.user.id, req.params.id, { edit: true });
  if (task.parentId) throw ApiError.badRequest('Cannot break down a subtask');

  const result = await aiClient.breakdown(
    task.title,
    task.description || null,
    new Date().toISOString()
  );

  // Schema-validate the AI output before any DB write (invariant).
  const titles = breakdownSchema.parse(result).subtasks;

  const subtasks = [];
  for (const title of titles) {
    // Subtasks belong to the task's owner so they nest under the owner's task.
    const created = await prisma.task.create({
      data: { userId: task.userId, parentId: task.id, title, priority: task.priority },
    });
    subtasks.push(created);
  }
  res.status(201).json({ task, subtasks });
}

// Gather the user's open tasks + today's commitments and ask the AI to build a
// time-blocked plan. Non-persisting — the client reviews then calls acceptPlan.
async function planDay(req, res) {
  const userId = req.user.id;
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);

  const [tasks, schedules] = await Promise.all([
    prisma.task.findMany({
      where: { userId, status: { not: 'COMPLETED' } },
      orderBy: { dueDate: 'asc' },
    }),
    prisma.schedule.findMany({
      where: { userId, startTime: { gte: startOfDay, lte: endOfDay } },
      orderBy: { startTime: 'asc' },
    }),
  ]);

  const result = await aiClient.planDay({
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      priority: t.priority,
      status: t.status,
    })),
    schedules: schedules.map((s) => ({
      title: s.title,
      startTime: s.startTime.toISOString(),
      endTime: s.endTime ? s.endTime.toISOString() : null,
    })),
    now: now.toISOString(),
  });
  res.json(result);
}

// Persist accepted plan blocks as schedule entries for the current user.
async function acceptPlan(req, res) {
  const { blocks } = acceptPlanSchema.parse(req.body);
  const schedules = [];
  for (const b of blocks) {
    const schedule = await prisma.schedule.create({
      data: {
        userId: req.user.id,
        title: b.title,
        description: b.reason || null,
        startTime: b.startTime,
        endTime: b.endTime || null,
      },
    });
    schedules.push(schedule);
  }
  res.status(201).json({ schedules });
}

async function summarize(req, res) {
  const { text, noteId } = summarizeSchema.parse(req.body);

  let content = text;
  if (!content && noteId) {
    const note = await prisma.note.findFirst({ where: { id: noteId, userId: req.user.id } });
    if (!note) throw ApiError.notFound('Note not found');
    content = `${note.title}\n\n${note.content}`;
  }
  if (!content) throw ApiError.badRequest('Provide text or noteId');

  const result = await aiClient.summarize(content);
  res.json(result);
}

async function prioritize(req, res) {
  const tasks = await prisma.task.findMany({
    where: { userId: req.user.id, status: { not: 'COMPLETED' } },
    orderBy: { dueDate: 'asc' },
  });
  const result = await aiClient.prioritize(
    tasks.map((t) => ({
      id: t.id,
      title: t.title,
      dueDate: t.dueDate ? t.dueDate.toISOString() : null,
      priority: t.priority,
      status: t.status,
      description: t.description,
    })),
    new Date().toISOString()
  );
  res.json(result);
}

// Gather the user's relevant data, then let the assistant answer grounded in it.
async function chat(req, res) {
  const { message, history } = chatSchema.parse(req.body);
  const userId = req.user.id;
  const now = new Date();

  const [tasks, notes, schedules, reminders] = await Promise.all([
    prisma.task.findMany({ where: { userId }, orderBy: { dueDate: 'asc' }, take: 50 }),
    prisma.note.findMany({ where: { userId }, orderBy: { updatedAt: 'desc' }, take: 30 }),
    prisma.schedule.findMany({ where: { userId, startTime: { gte: now } }, orderBy: { startTime: 'asc' }, take: 30 }),
    prisma.reminder.findMany({ where: { userId, remindAt: { gte: now } }, orderBy: { remindAt: 'asc' }, take: 30 }),
  ]);

  const context = {
    now: now.toISOString(),
    tasks: tasks.map((t) => ({ id: t.id, title: t.title, priority: t.priority, status: t.status, dueDate: t.dueDate })),
    notes: notes.map((n) => ({ id: n.id, title: n.title, snippet: (n.content || '').slice(0, 300), tags: n.tags })),
    schedules: schedules.map((s) => ({ title: s.title, startTime: s.startTime })),
    reminders: reminders.map((r) => ({ message: r.message, remindAt: r.remindAt })),
  };

  const result = await aiClient.chat(message, context, history || []);
  res.json(result);
}

// Per-user AI usage & cost summary (Roadmap C3): totals, per-endpoint breakdown,
// and the last 7 days of spend.
async function usage(req, res) {
  // Bounded to the reporting window rather than every row the account has ever
  // written. `windowDays` (default 30) covers the 7-day chart plus useful history;
  // the response says which window the totals cover so the client can label it.
  const windowDays = Math.min(365, Math.max(7, Number(req.query.days) || 30));
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (windowDays - 1));
  since.setUTCHours(0, 0, 0, 0);

  const rows = await prisma.aiUsage.findMany({
    where: { userId: req.user.id, createdAt: { gte: since } },
    select: { endpoint: true, inputTokens: true, outputTokens: true, costUsd: true, createdAt: true },
  });

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;
  const byEndpointMap = {};
  const dayKey = (d) => new Date(d).toISOString().slice(0, 10);

  const days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(dayKey(d));
  }
  const costByDay = Object.fromEntries(days.map((d) => [d, 0]));

  for (const r of rows) {
    totalInputTokens += r.inputTokens;
    totalOutputTokens += r.outputTokens;
    totalCostUsd += r.costUsd;
    const e = (byEndpointMap[r.endpoint] = byEndpointMap[r.endpoint] || {
      endpoint: r.endpoint,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    });
    e.calls += 1;
    e.inputTokens += r.inputTokens;
    e.outputTokens += r.outputTokens;
    e.costUsd += r.costUsd;
    const key = dayKey(r.createdAt);
    if (key in costByDay) costByDay[key] += r.costUsd;
  }

  const round = (n) => Math.round(n * 1e6) / 1e6;
  res.json({
    windowDays,
    callCount: rows.length,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd: round(totalCostUsd),
    byEndpoint: Object.values(byEndpointMap)
      .map((e) => ({ ...e, costUsd: round(e.costUsd) }))
      .sort((a, b) => b.costUsd - a.costUsd),
    last7Days: days.map((d) => ({ date: d, costUsd: round(costByDay[d]) })),
  });
}

// Backfill embeddings for all of the user's existing tasks and notes so semantic
// search works over data created before embeddings were enabled.
async function reindex(req, res) {
  if (!config.embeddingsEnabled) {
    throw ApiError.badRequest('Embeddings are disabled. Set EMBEDDINGS_ENABLED=true (and a Voyage key) first.');
  }
  const userId = req.user.id;
  const [tasks, notes] = await Promise.all([
    prisma.task.findMany({ where: { userId } }),
    prisma.note.findMany({ where: { userId } }),
  ]);
  // Batch into one embed call and report how many rows were actually indexed,
  // not how many were attempted — a partial provider failure must be visible.
  const { indexed, failed, total } = await embeddingService.reindexAll(tasks, notes);
  res.json({ indexed, failed, total });
}

module.exports = { parseTask, createTaskFromText, breakdownTask, planDay, acceptPlan, summarize, prioritize, chat, usage, reindex };
