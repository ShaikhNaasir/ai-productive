'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register', asyncHandler(ctrl.register));
router.post('/login', asyncHandler(ctrl.login));
router.post('/logout', asyncHandler(ctrl.logout));

router.get('/me', requireAuth, asyncHandler(ctrl.me));
router.patch('/profile', requireAuth, asyncHandler(ctrl.updateProfile));
router.post('/change-password', requireAuth, asyncHandler(ctrl.changePassword));

module.exports = router;
