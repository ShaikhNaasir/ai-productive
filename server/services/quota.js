'use strict';

const prisma = require('../models/prisma');
const ApiError = require('../utils/ApiError');
const { limitsFor, effectivePlan } = require('../config/plans');

// Maps a countable resource to its Prisma model + a friendly label for the 402
// message the client turns into an upgrade prompt.
const RESOURCES = {
  tasks: { model: 'task', label: 'tasks' },
  notes: { model: 'note', label: 'notes' },
};

// Throw a 402 if creating one more `resource` would exceed the user's plan cap.
// Owner-scoped count, so shared rows never count against the sharee. No-op when the
// plan grants an unlimited (Infinity) allowance.
async function assertWithinQuota(user, resource) {
  const meta = RESOURCES[resource];
  if (!meta) return;
  const cap = limitsFor(effectivePlan(user))[resource];
  if (cap === Infinity) return;

  const used = await prisma[meta.model].count({ where: { userId: user.id } });
  if (used >= cap) {
    throw ApiError.paymentRequired(
      `You've reached the free plan limit of ${cap} ${meta.label}. Upgrade to add more.`,
      { resource, limit: cap, plan: effectivePlan(user), upgrade: true }
    );
  }
}

// Month-to-date LLM spend for a user, in USD. Used by the AI budget guard.
async function monthlyAiCostUsd(userId) {
  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const agg = await prisma.aiUsage.aggregate({
    where: { userId, createdAt: { gte: start } },
    _sum: { costUsd: true },
  });
  return agg._sum?.costUsd || 0;
}

module.exports = { assertWithinQuota, monthlyAiCostUsd, RESOURCES };
