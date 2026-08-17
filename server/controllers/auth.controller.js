'use strict';

const bcrypt = require('bcryptjs');
const prisma = require('../models/prisma');
const { signToken, verifyToken } = require('../utils/jwt');
const ApiError = require('../utils/ApiError');
const {
  registerSchema,
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
} = require('../validators/auth.schema');

const SALT_ROUNDS = 10;

function serializeUser(user) {
  return { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt };
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
  const user = await prisma.user.create({
    data: { email: data.email, passwordHash, name: data.name },
  });

  res.status(201).json({ user: serializeUser(user), token: issueToken(user) });
}

async function login(req, res) {
  const data = loginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const ok = await bcrypt.compare(data.password, user.passwordHash);
  if (!ok) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  res.json({ user: serializeUser(user), token: issueToken(user) });
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

  res.json({ success: true, token: issueToken(updated) });
}

module.exports = { register, login, logout, me, updateProfile, changePassword };
