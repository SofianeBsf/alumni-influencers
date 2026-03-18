/**
 * Token Service
 * Generates cryptographically secure random tokens for:
 * - Email verification
 * - Password reset
 * - API client bearer tokens
 *
 * Uses Node.js built-in crypto module (no extra dependencies).
 * All tokens are URL-safe hex strings.
 */

const crypto = require('crypto');

/**
 * Generate a cryptographically random hex token.
 * @param {number} bytes - Number of random bytes (default 32 = 256-bit token)
 * @returns {string} Hex string token
 */
const generateToken = (bytes = 32) => {
  return crypto.randomBytes(bytes).toString('hex');
};

/**
 * Generate a token and its SHA-256 hash.
 * We store the hash in DB and send the plain token in email/response.
 * This means even if the DB is compromised, tokens cannot be used.
 *
 * @param {number} bytes
 * @returns {{ token: string, hash: string }}
 */
const generateTokenWithHash = (bytes = 32) => {
  const token = generateToken(bytes);
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, hash };
};

/**
 * Hash an existing token (for lookups).
 * @param {string} token
 * @returns {string} SHA-256 hex hash
 */
const hashToken = (token) => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Generate an API bearer token with a visible prefix.
 * Format: "ai_<64-char-hex>" (ai = alumni-influencers)
 * @returns {{ fullToken: string, prefix: string }}
 */
const generateApiToken = () => {
  const rawToken = generateToken(32); // 64 hex chars
  const fullToken = `ai_${rawToken}`;
  const prefix = fullToken.substring(0, 11); // "ai_" + first 8 hex chars
  return { fullToken, prefix };
};

/**
 * Calculate token expiry date from now.
 * @param {number} hours
 * @returns {Date}
 */
const getExpiryDate = (hours) => {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
};

module.exports = { generateToken, generateTokenWithHash, hashToken, generateApiToken, getExpiryDate };
