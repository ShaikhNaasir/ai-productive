'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const ctrl = require('../controllers/admin.controller');

const router = express.Router();

// Every admin route requires an authenticated ADMIN. This router is the single
// sanctioned place that reads across users; handlers stay metadata-only (no task
// titles, note bodies, etc.). Moderation endpoints land here in the next slice.
router.use(requireAuth, requireAdmin);

// Authorization probe: 200 only for an admin, 403 otherwise.
router.get(
  '/ping',
  asyncHandler(async (req, res) => {
    res.json({ ok: true, admin: req.user.email });
  })
);

router.get('/metrics', asyncHandler(ctrl.metrics));
router.get('/users', asyncHandler(ctrl.listUsers));
router.get('/users/:id', asyncHandler(ctrl.getUser));

module.exports = router;
