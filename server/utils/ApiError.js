'use strict';

// Typed error carrying an HTTP status code, thrown by controllers and handled centrally.
class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg = 'Bad request', details) {
    return new ApiError(400, msg, details);
  }
  static unauthorized(msg = 'Unauthorized') {
    return new ApiError(401, msg);
  }
  static forbidden(msg = 'Forbidden') {
    return new ApiError(403, msg);
  }
  static notFound(msg = 'Not found') {
    return new ApiError(404, msg);
  }
  static conflict(msg = 'Conflict') {
    return new ApiError(409, msg);
  }
  // Plan quota exceeded — the client renders this as an upgrade prompt.
  static paymentRequired(msg = 'Payment required', details) {
    return new ApiError(402, msg, details);
  }
  static serviceUnavailable(msg = 'Service unavailable') {
    return new ApiError(503, msg);
  }
}

module.exports = ApiError;
