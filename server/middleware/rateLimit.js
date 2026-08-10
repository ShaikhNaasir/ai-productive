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

module.exports = { authLimiter };
