'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/ai.controller');

const router = express.Router();

router.use(requireAuth);

router.post('/parse-task', asyncHandler(ctrl.parseTask));
router.post('/tasks', asyncHandler(ctrl.createTaskFromText));
router.post('/summarize', asyncHandler(ctrl.summarize));
router.post('/prioritize', asyncHandler(ctrl.prioritize));
router.post('/chat', asyncHandler(ctrl.chat));

module.exports = router;
