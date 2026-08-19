'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { requireVerified } = require('../middleware/requireVerified');
const ctrl = require('../controllers/billing.controller');

const router = express.Router();

// NOTE: the webhook (`POST /api/billing/webhook`) is intentionally NOT mounted here.
// It needs the raw request body for signature verification and must stay
// unauthenticated, so it's wired directly in app.js before the JSON body parser.

router.use(requireAuth);

router.get('/status', asyncHandler(ctrl.status));
router.post('/checkout', requireVerified, asyncHandler(ctrl.checkout));
router.post('/verify', asyncHandler(ctrl.verify));
router.post('/cancel', asyncHandler(ctrl.cancel));

module.exports = router;
