'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/search.controller');

const router = express.Router();

router.use(requireAuth);
router.get('/', asyncHandler(ctrl.search));
router.post('/', asyncHandler(ctrl.search));

module.exports = router;
