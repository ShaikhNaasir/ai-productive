'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Every admin route requires an authenticated ADMIN. This router is the single
// sanctioned place that reads across users; handlers stay metadata-only (no task
// titles, note bodies, etc.). Read/moderation endpoints land here in later slices.
router.use(requireAuth, requireAdmin);

// Authorization probe: 200 only for an admin, 403 otherwise.
router.get(
  '/ping',
  asyncHandler(async (req, res) => {
    res.json({ ok: true, admin: req.user.email });
  })
);

module.exports = router;
