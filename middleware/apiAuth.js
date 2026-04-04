/**
 * API Authentication Middleware
 * Validates Bearer tokens for external API clients.
 * Logs every API request (success or failure) to the ApiLog collection.
 */

const bcrypt = require('bcryptjs');
const ApiClient = require('../models/ApiClient');
const ApiLog = require('../models/ApiLog');

/**
 * Extract bearer token from Authorization header.
 * Expected format: "Bearer ai_xxxxxxxx..."
 */
const extractBearerToken = (req) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.substring(7); // Remove "Bearer " prefix
};

/**
 * Log an API request to the database.
 */
const logRequest = async (req, clientId, authSuccess, statusCode = null) => {
  const token = extractBearerToken(req);
  try {
    await ApiLog.create({
      client: clientId || null,
      endpoint: req.originalUrl,
      method: req.method,
      ipAddress: req.ip || req.connection.remoteAddress,
      statusCode,
      authSuccess,
      tokenPrefix: token ? token.substring(0, 11) : null,
    });
  } catch (err) {
    // Log failures should never crash the app
    console.error('[ApiLog] Failed to log request:', err.message);
  }
};

/**
 * requireApiToken - Middleware that validates Bearer token.
 * Attaches the authenticated client to req.apiClient.
 */
const requireApiToken = async (req, res, next) => {
  const token = extractBearerToken(req);

  if (!token) {
    await logRequest(req, null, false, 401);
    return res.status(401).json({
      success: false,
      error: 'Missing Authorization header. Use: Bearer <your_token>',
    });
  }

  try {
    // Use the token prefix (first 11 chars: "ai_" + 8 hex) to narrow the
    // lookup to at most one candidate before doing the slow bcrypt comparison.
    // This reduces from O(n * bcrypt) to O(1 * bcrypt) per request — critical
    // when multiple concurrent requests hit the middleware simultaneously.
    const prefix = token.substring(0, 11);
    const candidates = await ApiClient
      .find({ isActive: true, tokenPrefix: prefix })
      .select('+tokenHash');

    let matchedClient = null;
    for (const client of candidates) {
      const isMatch = await bcrypt.compare(token, client.tokenHash);
      if (isMatch) {
        matchedClient = client;
        break;
      }
    }

    if (!matchedClient) {
      await logRequest(req, null, false, 401);
      return res.status(401).json({
        success: false,
        error: 'Invalid or revoked API token.',
      });
    }

    // Update last used timestamp (fire and forget)
    ApiClient.findByIdAndUpdate(matchedClient._id, { lastUsedAt: new Date() }).exec();

    req.apiClient = matchedClient;
    await logRequest(req, matchedClient._id, true, 200);
    next();
  } catch (err) {
    console.error('[ApiAuth] Error:', err);
    await logRequest(req, null, false, 500);
    return res.status(500).json({ success: false, error: 'Authentication error.' });
  }
};

/**
 * requireScope(permission) — Scope-enforcement middleware factory.
 * Must be used AFTER requireApiToken (which populates req.apiClient).
 *
 * Usage:
 *   router.get('/alumni', requireApiToken, requireScope('read:alumni'), handler);
 *
 * Returns 403 if the authenticated client's scope array does not include
 * the required permission string.
 */
const requireScope = (permission) => (req, res, next) => {
  const client = req.apiClient;

  if (!client || !Array.isArray(client.scope) || !client.scope.includes(permission)) {
    return res.status(403).json({
      success: false,
      error: `Forbidden. This token does not have the '${permission}' permission.`,
    });
  }

  next();
};

module.exports = { requireApiToken, requireScope, logRequest };
