'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/habit.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.patch('/:id', asyncHandler(ctrl.update));
router.delete('/:id', asyncHandler(ctrl.remove));
router.post('/:id/check-in', asyncHandler(ctrl.checkIn));
router.delete('/:id/check-in', asyncHandler(ctrl.uncheck));

module.exports = router;
