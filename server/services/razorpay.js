'use strict';

const crypto = require('crypto');
const axios = require('axios');
const config = require('../config/env');
const ApiError = require('../utils/ApiError');

const API_BASE = 'https://api.razorpay.com/v1';

// Billing is optional: with no keys the integration stays dark. Checkout/cancel
// throw a clean 503 (never a crash), and plan-gating keeps working off User.plan.
function isConfigured() {
  const { keyId, keySecret } = config.razorpay;
  return Boolean(keyId && keySecret);
}

function requireConfigured() {
  if (!isConfigured()) {
    throw ApiError.serviceUnavailable('Billing is not configured on this server.');
  }
}

function authHeader() {
  const { keyId, keySecret } = config.razorpay;
  return 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64');
}

// Constant-time HMAC-SHA256 compare so signature checks don't leak via timing and a
// malformed/short signature can't throw inside timingSafeEqual.
function safeEqualHmac(expectedHex, providedHex) {
  const a = Buffer.from(expectedHex, 'utf8');
  const b = Buffer.from(String(providedHex || ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Open a subscription against the configured plan. Returns the Razorpay
// subscription object (its `id` is what the client hands to Checkout).
async function createSubscription({ notes } = {}) {
  requireConfigured();
  const { planId } = config.razorpay;
  if (!planId) {
    throw ApiError.serviceUnavailable('No billing plan configured (RAZORPAY_PLAN_ID).');
  }
  try {
    const { data } = await axios.post(
      `${API_BASE}/subscriptions`,
      {
        plan_id: planId,
        total_count: 120, // up to 120 billing cycles; the user can cancel anytime
        customer_notify: 1,
        notes: notes || {},
      },
      { headers: { Authorization: authHeader() }, timeout: 15000 }
    );
    return data;
  } catch (err) {
    throw ApiError.serviceUnavailable(
      `Could not start checkout: ${err.response?.data?.error?.description || err.message}`
    );
  }
}

async function cancelSubscription(subscriptionId, atCycleEnd = true) {
  requireConfigured();
  try {
    const { data } = await axios.post(
      `${API_BASE}/subscriptions/${subscriptionId}/cancel`,
      { cancel_at_cycle_end: atCycleEnd ? 1 : 0 },
      { headers: { Authorization: authHeader() }, timeout: 15000 }
    );
    return data;
  } catch (err) {
    throw ApiError.serviceUnavailable(
      `Could not cancel subscription: ${err.response?.data?.error?.description || err.message}`
    );
  }
}

// Verify the signature Razorpay Checkout returns to the client after a successful
// subscription payment: HMAC over `payment_id|subscription_id` keyed by the secret.
function verifyPaymentSignature({ paymentId, subscriptionId, signature }) {
  requireConfigured();
  const expected = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest('hex');
  return safeEqualHmac(expected, signature);
}

// Verify a webhook delivery: HMAC over the exact raw request body keyed by the
// webhook secret. `rawBody` must be the unparsed bytes (Buffer/string).
function verifyWebhookSignature(rawBody, signature) {
  const secret = config.razorpay.webhookSecret;
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqualHmac(expected, signature);
}

module.exports = {
  isConfigured,
  createSubscription,
  cancelSubscription,
  verifyPaymentSignature,
  verifyWebhookSignature,
};
