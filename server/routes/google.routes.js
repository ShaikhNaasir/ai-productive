'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireVerified } = require('../middleware/requireVerified');
const ctrl = require('../controllers/google.controller');

const router = express.Router();

// OAuth redirect target — Google calls this with no bearer token; the user is
// identified from the signed `state` param, so it must NOT require auth.
router.get('/callback', asyncHandler(ctrl.callback));

// Everything else is user-scoped and requires a bearer token. Connecting/syncing an
// external account is gated on a verified email; reading status stays open.
router.get('/auth-url', requireAuth, requireVerified, asyncHandler(ctrl.authUrl));
router.get('/status', requireAuth, asyncHandler(ctrl.status));
router.post('/sync', requireAuth, requireVerified, asyncHandler(ctrl.sync));
router.delete('/disconnect', requireAuth, asyncHandler(ctrl.disconnect));

module.exports = router;
