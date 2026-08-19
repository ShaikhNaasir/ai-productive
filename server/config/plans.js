'use strict';

// Single source of truth for what each SaaS tier is allowed (Roadmap D5). Gating
// everywhere (AI budget, resource caps) reads these numbers, so tuning a limit is a
// one-line change here. `Infinity` means "no cap".
//
// PAID is unlocked by an active Razorpay subscription (see services/razorpay.js and
// the billing webhook) or by an admin setting the plan directly.
const PLAN_LIMITS = {
  FREE: {
    aiMonthlyCostUsd: 2, // month-to-date LLM spend ceiling before calls are blocked
    aiRateMax: 30, // AI calls per 15-minute window (anti-abuse, plan-differentiated)
    tasks: 100,
    notes: 50,
    docSizeBytes: 1 * 1024 * 1024, // 1 MB per uploaded document
  },
  PAID: {
    aiMonthlyCostUsd: 50,
    aiRateMax: 120,
    tasks: Infinity,
    notes: Infinity,
    docSizeBytes: 10 * 1024 * 1024, // 10 MB
  },
};

function limitsFor(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.FREE;
}

// A user is PAID only while their plan is PAID *and* the current billing period has
// not lapsed. A null renewal date means an open-ended grant (e.g. set by an admin).
// This is the runtime belt: even if a downgrade webhook is late, an expired period
// stops counting as paid.
function isPaid(user) {
  if (!user || user.plan !== 'PAID') return false;
  if (!user.planRenewsAt) return true;
  return new Date(user.planRenewsAt).getTime() > Date.now();
}

// The plan actually in force right now (an expired PAID user is treated as FREE).
function effectivePlan(user) {
  return isPaid(user) ? 'PAID' : 'FREE';
}

module.exports = { PLAN_LIMITS, limitsFor, isPaid, effectivePlan };
