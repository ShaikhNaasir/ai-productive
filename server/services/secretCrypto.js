'use strict';

// Symmetric encryption for secrets at rest (Roadmap F2) — currently the TOTP
// secret. AES-256-GCM. The key is derived from JWT_SECRET so no extra owner config
// is required; set a dedicated TWO_FACTOR_ENC_KEY to rotate/separate it.
const crypto = require('crypto');
const config = require('../config/env');

const PREFIX = 'v1';

function key() {
  const material = process.env.TWO_FACTOR_ENC_KEY || config.jwt.secret;
  return crypto.createHash('sha256').update(`${material}:totp`).digest(); // 32 bytes
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

// Decrypt a value produced by encrypt(). A value not in the v1 envelope is returned
// as-is, so a secret written before encryption was added (legacy plaintext) still works.
function decrypt(payload) {
  if (typeof payload !== 'string' || !payload.startsWith(`${PREFIX}:`)) return payload;
  const [, ivb, tagb, ctb] = payload.split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivb, 'base64'));
  decipher.setAuthTag(Buffer.from(tagb, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctb, 'base64')), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
