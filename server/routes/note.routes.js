'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/note.controller');

const router = express.Router();

router.use(requireAuth);

router.get('/', asyncHandler(ctrl.list));
router.post('/', asyncHandler(ctrl.create));
router.get('/:id', asyncHandler(ctrl.getOne));
router.patch('/:id', asyncHandler(ctrl.update));
router.post('/:id/pin', asyncHandler(ctrl.togglePin));
router.delete('/:id', asyncHandler(ctrl.remove));

module.exports = router;
