'use strict';

// RFC 6238 TOTP (and RFC 4226 HOTP underneath) implemented on Node crypto — no
// third-party dependency. Used for optional two-factor auth (Roadmap E2).
const crypto = require('crypto');

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD = 30; // seconds
const DIGITS = 6;

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return out;
}

function base32Decode(str) {
  const clean = str.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

// A fresh base32 secret (160 bits, the RFC-recommended size for SHA1).
function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secretBase32, counter) {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  // 64-bit big-endian counter (safe for the ~2^31 range of TOTP time counters).
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter >>> 0, 4);

  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

function currentCounter(t = Date.now()) {
  return Math.floor(t / 1000 / PERIOD);
}

// Verify a code against the secret, allowing ±`window` steps for clock skew.
function verify(secretBase32, code, window = 1) {
  if (!secretBase32 || !code) return false;
  const clean = String(code).replace(/\s/g, '');
  if (!/^\d{6}$/.test(clean)) return false;
  const counter = currentCounter();
  for (let w = -window; w <= window; w += 1) {
    if (hotp(secretBase32, counter + w) === clean) return true;
  }
  return false;
}

// otpauth:// URI an authenticator app scans (or the user pastes in manually).
function otpauthURL(secretBase32, label, issuer = 'Productivity Assistant') {
  const enc = encodeURIComponent;
  return (
    `otpauth://totp/${enc(issuer)}:${enc(label)}` +
    `?secret=${secretBase32}&issuer=${enc(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD}`
  );
}

module.exports = { generateSecret, hotp, verify, otpauthURL, base32Encode, base32Decode };
