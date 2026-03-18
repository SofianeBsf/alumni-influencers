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
    // Find all active clients and check token hash
    // We only need to check active clients — inactive = revoked
    const clients = await ApiClient.find({ isActive: true }).select('+tokenHash');

    let matchedClient = null;
    for (const client of clients) {
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

module.exports = { requireApiToken, logRequest };
