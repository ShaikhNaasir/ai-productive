'use strict';

const crypto = require('crypto');
const prisma = require('../models/prisma');
const config = require('../config/env');
const mailer = require('./mailer');

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

// Issue a fresh single-use token: store only its hash + expiry, return the raw
// token (which goes in the emailed link and is never persisted in the clear).
async function issue(user) {
  const raw = crypto.randomBytes(32).toString('hex');
  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerifyTokenHash: hashToken(raw), emailVerifyExpires: new Date(Date.now() + TOKEN_TTL_MS) },
  });
  return raw;
}

function linkFor(rawToken) {
  return `${config.clientOrigin}/verify-email?token=${rawToken}`;
}

// Issue a token and email the verification link. Returns how delivery went so the
// controller can expose a dev link when email isn't configured. Never throws on a
// send failure — verification can always be retried via resend.
async function sendVerification(user) {
  const raw = await issue(user);
  const link = linkFor(raw);

  if (!mailer.isConfigured()) {
    // Dev-mode: no provider. Only reveal the link off-production so a misconfigured
    // prod can't be used to self-verify arbitrary accounts.
    return { delivery: 'devmode', devVerifyUrl: config.env === 'production' ? undefined : link };
  }
  try {
    await mailer.sendVerificationEmail(user.email, user.name, link);
    return { delivery: 'sent' };
  } catch {
    return { delivery: 'error' };
  }
}

// Consume a raw token: valid, unexpired, and matching a user → mark verified and
// clear the token. Returns the updated user, or null if the token is bad/expired.
async function verify(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const user = await prisma.user.findFirst({ where: { emailVerifyTokenHash: hashToken(rawToken) } });
  if (!user) return null;
  if (!user.emailVerifyExpires || new Date(user.emailVerifyExpires).getTime() < Date.now()) {
    return null;
  }
  return prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, emailVerifyTokenHash: null, emailVerifyExpires: null },
  });
}

// One-time grandfather: mark pre-existing accounts as verified so rolling the
// feature out doesn't nag or lock out current users. A brand-new unverified account
// always has a pending token hash (issued at register), so it is never swept in;
// only accounts that predate the feature (unverified, no token) are grandfathered.
// Idempotent: after the first run there are no such rows.
async function grandfatherExisting() {
  const { count } = await prisma.user.updateMany({
    where: { emailVerified: false, emailVerifyTokenHash: null },
    data: { emailVerified: true },
  });
  return count;
}

module.exports = { issue, sendVerification, verify, hashToken, grandfatherExisting };
