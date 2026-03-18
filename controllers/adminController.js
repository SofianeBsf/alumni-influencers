/**
 * Admin Controller
 * Manages API clients (bearer tokens), usage statistics, and token revocation.
 * All routes here require admin role.
 */

const ApiClient = require('../models/ApiClient');
const ApiLog = require('../models/ApiLog');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { generateApiToken } = require('../services/tokenService');

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

/**
 * GET /admin
 * Admin dashboard with overview stats.
 */
const getDashboard = async (req, res) => {
  try {
    const [totalClients, activeClients, totalLogs, recentLogs] = await Promise.all([
      ApiClient.countDocuments(),
      ApiClient.countDocuments({ isActive: true }),
      ApiLog.countDocuments(),
      ApiLog.find().sort({ createdAt: -1 }).limit(10).populate('client', 'name'),
    ]);

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      stats: { totalClients, activeClients, totalLogs },
      recentLogs,
    });
  } catch (err) {
    console.error('[Admin] getDashboard error:', err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load dashboard.' });
  }
};

// ─── API CLIENTS ──────────────────────────────────────────────────────────────

/**
 * GET /admin/clients
 * List all API clients with their status and usage.
 */
const getClients = async (req, res) => {
  try {
    const clients = await ApiClient.find().sort({ createdAt: -1 });
    res.render('admin/clients', { title: 'API Clients', clients });
  } catch (err) {
    console.error('[Admin] getClients error:', err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load clients.' });
  }
};

/**
 * POST /admin/clients/create
 * Generate a new API client with a bearer token.
 * The plain token is shown ONCE — not stored. Only hash is stored.
 */
const createClient = async (req, res) => {
  try {
    const { name, description, scope } = req.body;

    // Generate the token
    const { fullToken, prefix } = generateApiToken();

    // Hash the token for storage (bcrypt, 10 rounds)
    const tokenHash = await bcrypt.hash(fullToken, 10);

    await ApiClient.create({ name, description, scope, tokenPrefix: prefix, tokenHash });

    // Flash the plain token once — it won't be shown again
    req.session.newToken = fullToken;
    req.session.success = `API client "${name}" created. Save the token shown below — it won't be shown again!`;
    res.redirect('/admin/clients');
  } catch (err) {
    console.error('[Admin] createClient error:', err);
    req.session.error = 'Failed to create API client.';
    res.redirect('/admin/clients');
  }
};

/**
 * POST /admin/clients/:id/revoke
 * Revoke (deactivate) an API client's token.
 */
const revokeClient = async (req, res) => {
  try {
    await ApiClient.findByIdAndUpdate(req.params.id, { isActive: false });
    req.session.success = 'Token revoked successfully.';
    res.redirect('/admin/clients');
  } catch (err) {
    console.error('[Admin] revokeClient error:', err);
    req.session.error = 'Failed to revoke token.';
    res.redirect('/admin/clients');
  }
};

/**
 * POST /admin/clients/:id/activate
 * Re-activate a previously revoked client.
 */
const activateClient = async (req, res) => {
  try {
    await ApiClient.findByIdAndUpdate(req.params.id, { isActive: true });
    req.session.success = 'Token re-activated.';
    res.redirect('/admin/clients');
  } catch (err) {
    console.error('[Admin] activateClient error:', err);
    req.session.error = 'Failed to activate token.';
    res.redirect('/admin/clients');
  }
};

// ─── USAGE STATISTICS ─────────────────────────────────────────────────────────

/**
 * GET /admin/stats
 * Shows detailed usage statistics per client, per endpoint.
 */
const getStats = async (req, res) => {
  try {
    const clients = await ApiClient.find().sort({ createdAt: -1 });

    // Per-client stats: request count, last used, endpoint breakdown
    const clientStats = await Promise.all(
      clients.map(async (client) => {
        const logs = await ApiLog.find({ client: client._id });
        const endpointBreakdown = logs.reduce((acc, log) => {
          const key = `${log.method} ${log.endpoint}`;
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {});

        return {
          client,
          totalRequests: logs.length,
          successfulRequests: logs.filter((l) => l.authSuccess).length,
          lastRequest: logs.length > 0 ? logs[logs.length - 1].createdAt : null,
          endpointBreakdown,
        };
      })
    );

    // Overall stats
    const totalRequests = await ApiLog.countDocuments();
    const failedAuth = await ApiLog.countDocuments({ authSuccess: false });

    // Requests over last 7 days grouped by day
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const dailyActivity = await ApiLog.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.render('admin/stats', {
      title: 'Usage Statistics',
      clientStats,
      totalRequests,
      failedAuth,
      dailyActivity,
    });
  } catch (err) {
    console.error('[Admin] getStats error:', err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load statistics.' });
  }
};

/**
 * GET /admin/logs
 * Raw log viewer with pagination.
 */
const getLogs = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 50;
    const skip = (page - 1) * limit;

    const [logs, total] = await Promise.all([
      ApiLog.find()
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('client', 'name'),
      ApiLog.countDocuments(),
    ]);

    res.render('admin/logs', {
      title: 'API Logs',
      logs,
      page,
      totalPages: Math.ceil(total / limit),
      total,
    });
  } catch (err) {
    console.error('[Admin] getLogs error:', err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load logs.' });
  }
};

// ─── ALUMNI EVENTS ────────────────────────────────────────────────────────────

/**
 * POST /admin/events/record
 * Record that an alumni attended a university event (grants 4th monthly bid slot).
 */
const recordEventAttendance = async (req, res) => {
  try {
    const { userId, eventName, eventDate } = req.body;
    const date = new Date(eventDate);
    const monthYear = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    await User.findByIdAndUpdate(userId, {
      $push: {
        alumniEventAttendance: { eventName, eventDate: date, monthYear },
      },
    });

    req.session.success = 'Event attendance recorded.';
    res.redirect('/admin');
  } catch (err) {
    console.error('[Admin] recordEventAttendance error:', err);
    req.session.error = 'Failed to record attendance.';
    res.redirect('/admin');
  }
};

module.exports = {
  getDashboard,
  getClients, createClient, revokeClient, activateClient,
  getStats, getLogs,
  recordEventAttendance,
};
