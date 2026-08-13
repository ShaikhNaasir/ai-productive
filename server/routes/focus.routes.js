'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/focus.controller');

const router = express.Router();

router.use(requireAuth);

router.post('/start', asyncHandler(ctrl.start));
router.post('/:id/stop', asyncHandler(ctrl.stop));
router.get('/stats', asyncHandler(ctrl.stats));

module.exports = router;
