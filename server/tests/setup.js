'use strict';

// Test environment defaults. Real secrets are never required for unit tests.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
process.env.JWT_EXPIRES_IN = '1h';
