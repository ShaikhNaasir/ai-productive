'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/notification.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', asyncHandler(ctrl.list));
router.post('/read', asyncHandler(ctrl.markAllRead));
router.patch('/:id/read', asyncHandler(ctrl.markRead));

module.exports = router;
