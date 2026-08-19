'use strict';

const ApiError = require('../utils/ApiError');
const mailer = require('../services/mailer');

// Gate for actions that require a verified email (Roadmap E1). Chained after
// requireAuth. Fails with a 403 the client renders as a "verify your account"
// prompt. IMPORTANT: the block only engages when email delivery is configured —
// you must not lock users out of features they can't unblock because no
// verification email can be sent.
function requireVerified(req, res, next) {
  if (!mailer.isConfigured()) return next();
  // Admins are trusted (allowlisted) and always exempt.
  if (req.user && (req.user.emailVerified || req.user.role === 'ADMIN')) return next();
  return next(
    ApiError.forbidden('Please verify your email to use this feature.', { code: 'EMAIL_UNVERIFIED' })
  );
}

module.exports = { requireVerified };
