'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register', asyncHandler(ctrl.register));
router.post('/login', asyncHandler(ctrl.login));
router.post('/logout', asyncHandler(ctrl.logout));
// Public: the verification link is clicked from an email, before the SPA has a session.
router.post('/verify-email', asyncHandler(ctrl.verifyEmail));
// Public: completes login after the password step (the caller holds only a challenge token).
router.post('/2fa/login', asyncHandler(ctrl.loginTwoFactor));

router.get('/me', requireAuth, asyncHandler(ctrl.me));
router.patch('/profile', requireAuth, asyncHandler(ctrl.updateProfile));
router.post('/change-password', requireAuth, asyncHandler(ctrl.changePassword));
router.post('/resend-verification', requireAuth, asyncHandler(ctrl.resendVerification));
router.post('/2fa/setup', requireAuth, asyncHandler(ctrl.setupTwoFactor));
router.post('/2fa/enable', requireAuth, asyncHandler(ctrl.enableTwoFactor));
router.post('/2fa/disable', requireAuth, asyncHandler(ctrl.disableTwoFactor));

module.exports = router;
