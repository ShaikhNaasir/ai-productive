'use strict';

const crypto = require('crypto');

const BACKUP_CODE_COUNT = 10;

// Normalize for comparison: strip spacing/hyphens, uppercase. So "abcd-efghi",
// "ABCDEFGHI", and "abcd efghi" all match the same stored hash.
function normalize(code) {
  return String(code || '').replace(/[\s-]/g, '').toUpperCase();
}

function hashCode(code) {
  return crypto.createHash('sha256').update(normalize(code)).digest('hex');
}

// Generate one-time backup codes. Returns the plaintext codes (shown to the user
// exactly once) and their hashes (all that's persisted).
function generateBackupCodes(count = BACKUP_CODE_COUNT) {
  const plain = [];
  for (let i = 0; i < count; i += 1) {
    const raw = crypto.randomBytes(5).toString('hex'); // 10 hex chars
    plain.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return { plain, hashes: plain.map(hashCode) };
}

// Is `code` a valid unused backup code? Returns the remaining hashes with the used
// one removed (single-use), or null if the code doesn't match any stored hash.
function consumeBackupCode(storedHashes, code) {
  const target = hashCode(code);
  if (!Array.isArray(storedHashes) || !storedHashes.includes(target)) return null;
  return storedHashes.filter((h) => h !== target);
}

module.exports = { generateBackupCodes, consumeBackupCode, hashCode, normalize, BACKUP_CODE_COUNT };
