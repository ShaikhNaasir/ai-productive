'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/task.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.getOne));
router.patch('/:id', asyncHandler(ctrl.update));
router.post('/:id/complete', asyncHandler(ctrl.complete));
router.delete('/:id', asyncHandler(ctrl.remove));

module.exports = router;
