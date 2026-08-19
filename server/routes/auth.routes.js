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

router.get('/me', requireAuth, asyncHandler(ctrl.me));
router.patch('/profile', requireAuth, asyncHandler(ctrl.updateProfile));
router.post('/change-password', requireAuth, asyncHandler(ctrl.changePassword));
router.post('/resend-verification', requireAuth, asyncHandler(ctrl.resendVerification));

module.exports = router;
