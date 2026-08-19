'use strict';

const rateLimit = require('express-rate-limit');
const ApiError = require('../utils/ApiError');
const { limitsFor, effectivePlan } = require('../config/plans');
const { monthlyAiCostUsd } = require('../services/quota');

// Limits repeated auth attempts (login/register/change-password) from one IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts. Please try again later.' } },
});

// Coarse safety net across the whole API so no single client can flood any endpoint
// (the per-user AI limiter and the auth limiter still apply stricter caps on top).
// Keyed by user id once authenticated, otherwise by IP. Generous by default; tune
// with API_RATE_LIMIT_MAX.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: parseInt(process.env.API_RATE_LIMIT_MAX || '200', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user && req.user.id ? req.user.id : req.ip),
  message: { error: { message: 'Too many requests. Please slow down and try again shortly.' } },
});

// Caps AI calls per authenticated user so a single account (or a stolen token)
// can't spam the paid LLM endpoints. Keyed by user id (routes run after requireAuth).
// The window ceiling is plan-aware: PAID users get a higher burst allowance. An
// explicit AI_RATE_LIMIT_MAX override wins if set (keeps the old ops lever working).
const aiRateOverride = process.env.AI_RATE_LIMIT_MAX
  ? parseInt(process.env.AI_RATE_LIMIT_MAX, 10)
  : null;
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: (req) => aiRateOverride || limitsFor(effectivePlan(req.user)).aiRateMax,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user && req.user.id ? req.user.id : 'anonymous'),
  message: { error: { message: 'Too many AI requests. Please slow down and try again shortly.' } },
});

// Blocks a request once the user's month-to-date LLM spend has hit their plan's
// budget, returning a 402 the client renders as an upgrade prompt. GET endpoints
// (usage summary) are read-only and never cost money, so they're exempt. Fails open
// on a lookup error — a metering glitch must not take AI down.
async function enforceAiBudget(req, res, next) {
  if (req.method === 'GET') return next();
  try {
    const budget = limitsFor(effectivePlan(req.user)).aiMonthlyCostUsd;
    if (budget === Infinity) return next();
    const spent = await monthlyAiCostUsd(req.user.id);
    if (spent >= budget) {
      return next(
        ApiError.paymentRequired(
          `You've used your $${budget} monthly AI allowance on the free plan. Upgrade for more.`,
          { limit: budget, spent, plan: effectivePlan(req.user), upgrade: true }
        )
      );
    }
    return next();
  } catch {
    return next();
  }
}

module.exports = { authLimiter, apiLimiter, aiLimiter, enforceAiBudget };
