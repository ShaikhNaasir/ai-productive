'use strict';

const express = require('express');
const asyncHandler = require('../utils/asyncHandler');
const { requireAuth } = require('../middleware/auth');
const ctrl = require('../controllers/google.controller');

const router = express.Router();

// OAuth redirect target — Google calls this with no bearer token; the user is
// identified from the signed `state` param, so it must NOT require auth.
router.get('/callback', asyncHandler(ctrl.callback));

// Everything else is user-scoped and requires a bearer token.
router.get('/auth-url', requireAuth, asyncHandler(ctrl.authUrl));
router.get('/status', requireAuth, asyncHandler(ctrl.status));
router.post('/sync', requireAuth, asyncHandler(ctrl.sync));
router.delete('/disconnect', requireAuth, asyncHandler(ctrl.disconnect));

module.exports = router;
