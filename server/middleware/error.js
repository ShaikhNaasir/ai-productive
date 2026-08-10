'use strict';

const ApiError = require('../utils/ApiError');

function notFoundHandler(req, res, next) {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let details = err.details;

  // Zod validation errors
  if (err.name === 'ZodError') {
    statusCode = 400;
    message = 'Validation failed';
    details = err.issues?.map((i) => ({ path: i.path.join('.'), message: i.message }));
  }

  // Prisma known errors
  if (err.code === 'P2002') {
    statusCode = 409;
    message = 'A record with that value already exists';
  }
  if (err.code === 'P2025') {
    statusCode = 404;
    message = 'Record not found';
  }

  if (statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  res.status(statusCode).json({
    error: { message, ...(details ? { details } : {}) },
  });
}

module.exports = { notFoundHandler, errorHandler };
