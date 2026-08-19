'use strict';

const bcrypt = require('bcryptjs');
const prisma = require('../models/prisma');
const config = require('../config/env');
const { signToken, verifyToken } = require('../utils/jwt');
const { disconnectUser } = require('../realtime');
const ApiError = require('../utils/ApiError');
const emailVerification = require('../services/emailVerification');
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  verifyEmailSchema,
} = require('../validators/auth.schema');

const SALT_ROUNDS = 10;

// A real hash to compare against when the email is unknown, so a miss costs the same
// bcrypt work as a wrong password. Without it, response timing leaks which addresses
// are registered. Computed once at load.
const DUMMY_HASH = bcrypt.hashSync('unused-placeholder-password', SALT_ROUNDS);

function serializeUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
  };
}

// Emails in the ADMIN_EMAILS allowlist bootstrap as admins. The allowlist lives
// only in the environment (never in source), so nothing here reveals who that is.
function isAdminEmail(email) {
  return config.adminEmails.includes(String(email).toLowerCase());
}

function issueToken(user) {
  return signToken({ sub: user.id, email: user.email, ver: user.tokenVersion ?? 0 });
}

async function register(req, res) {
  const data = registerSchema.parse(req.body);

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw ApiError.conflict('Email already registered');
  }

  const passwordHash = await bcrypt.hash(data.password, SALT_ROUNDS);
  // Admins (allowlist) are trusted and auto-verified so they're never nagged or
  // locked out of admin actions. Everyone else must verify their email.
  const admin = isAdminEmail(data.email);
  const user = await prisma.user.create({
    data: {
      email: data.email,
      passwordHash,
      name: data.name,
      role: admin ? 'ADMIN' : 'USER',
      emailVerified: admin,
    },
  });

  // Fire off the verification email (best-effort). `delivery` tells the client
  // whether a real email went out; a dev link is included only off-production.
  let verification = { delivery: 'skipped' };
  if (!admin) {
    verification = await emailVerification.sendVerification(user);
  }

  res.status(201).json({ user: serializeUser(user), token: issueToken(user), verification });
}

async function login(req, res) {
  const data = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user) {
    // Burn an equivalent compare so an unknown email is not measurably faster.
    await bcrypt.compare(data.password, DUMMY_HASH);
    throw ApiError.unauthorized('Invalid email or password');
  }

  const ok = await bcrypt.compare(data.password, user.passwordHash);
  if (!ok) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (user.status === 'DISABLED' || user.status === 'DELETED') {
    throw ApiError.forbidden('This account is not active.');
  }

  // Self-healing bootstrap: if this email was added to the allowlist after the
  // account existed, promote it now. Never auto-demotes — revoking admin is an
  // explicit admin action.
  let account = user;
  if (isAdminEmail(user.email) && user.role !== 'ADMIN') {
    // Promote to admin and auto-verify (admins are trusted).
    account = await prisma.user.update({
      where: { id: user.id },
      data: { role: 'ADMIN', emailVerified: true },
    });
  }

  res.json({ user: serializeUser(account), token: issueToken(account) });
}

// Best-effort server-side revocation: if a valid token is presented, bump the
// user's tokenVersion so that token (and any others) can no longer authenticate.
// Always returns success so the client can clear its token regardless.
async function logout(req, res) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = verifyToken(token);
      const user = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (user) {
        await prisma.user.update({
          where: { id: user.id },
          data: { tokenVersion: (user.tokenVersion ?? 0) + 1 },
        });
        // Revocation only gates new connections; drop the live ones too.
        disconnectUser(user.id);
      }
    } catch {
      // Invalid/expired token — nothing to revoke.
    }
  }
  res.json({ success: true });
}

async function me(req, res) {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  res.json({ user: serializeUser(user) });
}

async function updateProfile(req, res) {
  const data = updateProfileSchema.parse(req.body);

  if (data.email) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing && existing.id !== req.user.id) {
      throw ApiError.conflict('Email already in use');
    }
  }

  const user = await prisma.user.update({
    where: { id: req.user.id },
    data,
  });
  res.json({ user: serializeUser(user) });
}

async function changePassword(req, res) {
  const data = changePasswordSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const ok = await bcrypt.compare(data.currentPassword, user.passwordHash);
  if (!ok) {
    throw ApiError.badRequest('Current password is incorrect');
  }

  const passwordHash = await bcrypt.hash(data.newPassword, SALT_ROUNDS);
  // Invalidate every previously issued token, then hand this session a fresh one
  // so the user who just changed their password isn't logged out.
  const tokenVersion = (user.tokenVersion ?? 0) + 1;
  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, tokenVersion },
  });
  // Sockets opened with a now-revoked token must not survive the password change.
  disconnectUser(user.id);

  res.json({ success: true, token: issueToken(updated) });
}

// Consume an emailed token to mark the account verified. Public (the link is
// clicked from an email, possibly before the SPA has a session).
async function verifyEmail(req, res) {
  const { token } = verifyEmailSchema.parse(req.body);
  const user = await emailVerification.verify(token);
  if (!user) {
    throw ApiError.badRequest('This verification link is invalid or has expired.');
  }
  res.json({ success: true, user: serializeUser(user) });
}

// Re-send the verification email for the signed-in user. No-op success if already
// verified so the client can call it idempotently.
async function resendVerification(req, res) {
  const user = await prisma.user.findUnique({ where: { id: req.user.id } });
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  if (user.emailVerified) {
    return res.json({ success: true, alreadyVerified: true });
  }
  const verification = await emailVerification.sendVerification(user);
  res.json({ success: true, verification });
}

module.exports = {
  register,
  login,
  logout,
  me,
  updateProfile,
  changePassword,
  verifyEmail,
  resendVerification,
};
