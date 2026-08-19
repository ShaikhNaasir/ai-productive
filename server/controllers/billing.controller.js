'use strict';

const crypto = require('crypto');
const prisma = require('../models/prisma');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');
const razorpay = require('../services/razorpay');
const { limitsFor, effectivePlan } = require('../config/plans');
const { monthlyAiCostUsd } = require('../services/quota');

function round4(n) {
  return Number((n || 0).toFixed(4));
}

// JSON can't carry Infinity; expose an unlimited cap as null so the client renders
// "Unlimited" rather than a bogus number.
function serializeLimits(limits) {
  const out = {};
  for (const [k, v] of Object.entries(limits)) out[k] = v === Infinity ? null : v;
  return out;
}

// Current plan, entitlements, and this user's usage against them. Provider-agnostic
// — works even when Razorpay is not configured.
async function status(req, res) {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  const plan = effectivePlan(user);
  const limits = limitsFor(plan);

  const [tasks, notes, aiCost] = await Promise.all([
    prisma.task.count({ where: { userId: user.id } }),
    prisma.note.count({ where: { userId: user.id } }),
    monthlyAiCostUsd(user.id),
  ]);

  res.json({
    plan,
    rawPlan: user.plan,
    planRenewsAt: user.planRenewsAt,
    subscriptionStatus: user.subscriptionStatus,
    billingConfigured: razorpay.isConfigured(),
    limits: serializeLimits(limits),
    usage: { tasks, notes, aiMonthlyCostUsd: round4(aiCost) },
  });
}

// Open a Razorpay subscription and hand the client what it needs to launch Checkout.
async function checkout(req, res) {
  const sub = await razorpay.createSubscription({
    notes: { userId: req.user.id, email: req.user.email },
  });
  await prisma.user.update({
    where: { id: req.user.id },
    data: { razorpaySubscriptionId: sub.id, subscriptionStatus: sub.status || 'created' },
  });
  res.json({ subscriptionId: sub.id, keyId: config.razorpay.keyId, planId: config.razorpay.planId });
}

// Post-Checkout callback from the client. Verifying the signature lets us grant
// access immediately; the webhook remains the source of truth for renewal dates.
async function verify(req, res) {
  const {
    razorpay_payment_id: paymentId,
    razorpay_subscription_id: subscriptionId,
    razorpay_signature: signature,
  } = req.body || {};
  if (!paymentId || !subscriptionId || !signature) {
    throw ApiError.badRequest('Missing payment verification fields');
  }
  if (!razorpay.verifyPaymentSignature({ paymentId, subscriptionId, signature })) {
    throw ApiError.badRequest('Payment verification failed');
  }
  const updated = await prisma.user.update({
    where: { id: req.user.id },
    data: { plan: 'PAID', subscriptionStatus: 'active', razorpaySubscriptionId: subscriptionId },
  });
  res.json({ plan: 'PAID', planRenewsAt: updated.planRenewsAt });
}

async function cancel(req, res) {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user.razorpaySubscriptionId) {
    throw ApiError.badRequest('No active subscription to cancel');
  }
  // Cancel at cycle end so the user keeps the access they've already paid for.
  await razorpay.cancelSubscription(user.razorpaySubscriptionId, true);
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { subscriptionStatus: 'cancelled' },
  });
  res.json({ subscriptionStatus: 'cancelled', planRenewsAt: updated.planRenewsAt });
}

const ACTIVE_EVENTS = [
  'subscription.activated',
  'subscription.charged',
  'subscription.resumed',
  'subscription.authenticated',
];
const END_EVENTS = [
  'subscription.halted',
  'subscription.cancelled',
  'subscription.completed',
  'subscription.expired',
];

// Reconcile one subscription event against the owning user. Returns the user id (for
// the audit row) or null if no user is linked to the subscription.
async function applySubscriptionEvent(event, entity) {
  const user = await prisma.user.findFirst({ where: { razorpaySubscriptionId: entity.id } });
  if (!user) return null;

  const data = { subscriptionStatus: entity.status || null };
  const renewsAt = entity.current_end ? new Date(entity.current_end * 1000) : null;

  if (ACTIVE_EVENTS.includes(event)) {
    data.plan = 'PAID';
    if (renewsAt) data.planRenewsAt = renewsAt;
  } else if (END_EVENTS.includes(event)) {
    // Keep paid access until the period they've paid for lapses; downgrade now only
    // if there's no remaining paid time.
    if (renewsAt && renewsAt.getTime() > Date.now()) {
      data.planRenewsAt = renewsAt;
    } else {
      data.plan = 'FREE';
      data.planRenewsAt = null;
    }
  }

  await prisma.user.update({ where: { id: user.id }, data });
  return user.id;
}

// Razorpay webhook. Mounted on the raw body (see app.js) so the HMAC signature can
// be verified over the exact bytes. Idempotent: a redelivered event id is a no-op.
// Unauthenticated by design — trust comes from the signature, not a session.
async function webhook(req, res) {
  const signature = req.headers['x-razorpay-signature'];
  const raw = req.body; // Buffer, thanks to express.raw()
  if (!razorpay.verifyWebhookSignature(raw, signature)) {
    return res.status(400).json({ error: { message: 'Invalid webhook signature' } });
  }

  // Prefer Razorpay's event id; fall back to a content hash so we still dedupe.
  const eventId =
    req.headers['x-razorpay-event-id'] ||
    crypto.createHash('sha256').update(raw).digest('hex');

  const seen = await prisma.billingEvent.findUnique({ where: { providerEventId: eventId } });
  if (seen) return res.json({ ok: true, deduped: true });

  let payload;
  try {
    payload = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.status(400).json({ error: { message: 'Malformed webhook body' } });
  }

  let userId = null;
  if (typeof payload.event === 'string' && payload.event.startsWith('subscription.')) {
    const entity = payload.payload?.subscription?.entity;
    if (entity?.id) userId = await applySubscriptionEvent(payload.event, entity);
  }

  await prisma.billingEvent.create({
    data: { providerEventId: eventId, type: payload.event || 'unknown', userId, payload },
  });
  return res.json({ ok: true });
}

module.exports = { status, checkout, verify, cancel, webhook, applySubscriptionEvent };
