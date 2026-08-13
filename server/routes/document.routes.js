'use strict';

const express = require('express');
const multer = require('multer');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { requireAuth } = require('../middleware/auth');
const { isTextMime, PDF_MIME } = require('../services/textExtract');
const ctrl = require('../controllers/document.controller');

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2MB

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
    if (err.code === 'LIMIT_FILE_SIZE') return next(ApiError.badRequest('File too large (max 2MB)'));
    return next(ApiError.badRequest(err.message || 'Upload failed'));
  });
}

const router = express.Router();

router.use(requireAuth);
router.post('/upload', uploadSingle, asyncHandler(ctrl.uploadAndSummarize));

module.exports = router;
