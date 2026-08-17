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
    req.user = { id: user.id, email: user.email };
    setUserId(user.id);
    return next();
  } catch (err) {
    // A real datastore error is a 500, not an auth failure.
    return next(err);
  }
}

module.exports = { requireAuth };
