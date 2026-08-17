'use strict';

const rateLimit = require('express-rate-limit');

// Limits repeated auth attempts (login/register/change-password) from one IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { message: 'Too many attempts. Please try again later.' } },
});

// Caps AI calls per authenticated user so a single account (or a stolen token)
// can't spam the paid LLM endpoints. Keyed by user id (routes run after requireAuth).
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AI_RATE_LIMIT_MAX || '60', 10),
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => (req.user && req.user.id ? req.user.id : 'anonymous'),
  message: { error: { message: 'Too many AI requests. Please slow down and try again shortly.' } },
});

module.exports = { authLimiter, aiLimiter };
