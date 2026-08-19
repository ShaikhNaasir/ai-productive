'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config/env');

function signToken(payload, options = {}) {
  return jwt.sign(payload, config.jwt.secret, { expiresIn: config.jwt.expiresIn, ...options });
}

function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

module.exports = { signToken, verifyToken };
