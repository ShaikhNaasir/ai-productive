'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/calendar.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/', asyncHandler(ctrl.calendar));

module.exports = router;
