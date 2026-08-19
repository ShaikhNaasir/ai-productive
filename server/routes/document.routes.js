'use strict';

const express = require('express');
const multer = require('multer');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { requireAuth } = require('../middleware/auth');
const { requireVerified } = require('../middleware/requireVerified');
const { isTextMime, PDF_MIME } = require('../services/textExtract');
const { PLAN_LIMITS } = require('../config/plans');
const ctrl = require('../controllers/document.controller');

// Hard ceiling = the most any plan allows; the per-plan cap (e.g. 1MB on FREE) is
// enforced in the controller so it can return a 402 upgrade prompt instead of a 400.
const MAX_FILE_BYTES = PLAN_LIMITS.PAID.docSizeBytes;
const MAX_FILE_MB = Math.round(MAX_FILE_BYTES / (1024 * 1024));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (isTextMime(file.mimetype) || file.mimetype === PDF_MIME) return cb(null, true);
    cb(new ApiError(400, `Unsupported file type: ${file.mimetype || 'unknown'}`));
  },
});

// Run multer for a single "file" field, translating its errors (e.g. size limit)
// into a clean 400 rather than an unhandled 500.
function uploadSingle(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof ApiError) return next(err);
    if (err.code === 'LIMIT_FILE_SIZE') return next(ApiError.badRequest(`File too large (max ${MAX_FILE_MB}MB)`));
    return next(ApiError.badRequest(err.message || 'Upload failed'));
  });
}

const router = express.Router();

router.use(requireAuth);
router.post('/upload', requireVerified, uploadSingle, asyncHandler(ctrl.uploadAndSummarize));

module.exports = router;
