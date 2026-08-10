'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/analytics.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/summary', asyncHandler(ctrl.summary));
router.get('/trends', asyncHandler(ctrl.trends));

module.exports = router;
