'use strict';

const { verifyToken } = require('../utils/jwt');
const ApiError = require('../utils/ApiError');
const prisma = require('../models/prisma');
const { setUserId } = require('./requestContext');

// Requires a valid Bearer token whose version still matches the user's current
// tokenVersion (so logout / password change can revoke it). Attaches { id, email }.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return next(ApiError.unauthorized('Authentication token missing'));
  }

  let payload;
  try {
    payload = verifyToken(token);
  } catch {
    return next(ApiError.unauthorized('Invalid or expired token'));
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || (payload.ver ?? 0) !== (user.tokenVersion ?? 0)) {
      return next(ApiError.unauthorized('Session expired. Please sign in again.'));
    }
    // A disabled or deleted account keeps its valid token but is locked out
    // everywhere. (Blocklist, not `!== ACTIVE`, so a row with a missing status is
    // never accidentally locked out.)
    if (user.status === 'DISABLED' || user.status === 'DELETED') {
      return next(ApiError.forbidden('This account is not active.'));
    }
    req.user = { id: user.id, email: user.email, role: user.role };
    setUserId(user.id);

    // Best-effort activity stamp for the admin "active today" metric. Throttled to
    // ~5 min so it isn't a write on every request; failures never break auth.
    try {
      const last = user.lastActiveAt ? new Date(user.lastActiveAt).getTime() : 0;
      if (Date.now() - last > 5 * 60 * 1000) {
        await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
      }
    } catch {
      /* activity stamp is best-effort */
    }

    return next();
  } catch (err) {
    // A real datastore error is a 500, not an auth failure.
    return next(err);
  }
}

// Gates admin-only routes. Must be chained after requireAuth, which loads the role.
// This is the single sanctioned exception to per-user data scoping.
function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'ADMIN') {
    return next(ApiError.forbidden('Admin access required'));
  }
  return next();
}

module.exports = { requireAuth, requireAdmin };
