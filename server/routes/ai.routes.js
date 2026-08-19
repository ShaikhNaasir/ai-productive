'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const { aiLimiter, enforceAiBudget } = require('../middleware/rateLimit');
const ctrl = require('../controllers/ai.controller');

const router = express.Router();

router.use(requireAuth);
router.use(aiLimiter);
router.use(asyncHandler(enforceAiBudget));

router.post('/parse-task', asyncHandler(ctrl.parseTask));
router.post('/tasks', asyncHandler(ctrl.createTaskFromText));
router.post('/tasks/:id/breakdown', asyncHandler(ctrl.breakdownTask));
router.post('/plan-day', asyncHandler(ctrl.planDay));
router.post('/plan-day/accept', asyncHandler(ctrl.acceptPlan));
router.post('/summarize', asyncHandler(ctrl.summarize));
router.post('/prioritize', asyncHandler(ctrl.prioritize));
router.post('/chat', asyncHandler(ctrl.chat));
router.get('/usage', asyncHandler(ctrl.usage));
router.post('/reindex', asyncHandler(ctrl.reindex));

module.exports = router;
