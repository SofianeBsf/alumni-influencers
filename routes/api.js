/**
 * Public API Routes
 * All routes protected by Bearer token authentication.
 * Rate limiting applied to prevent abuse.
 */

const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');
const analyticsController = require('../controllers/analyticsController');
const { requireApiToken, requireScope } = require('../middleware/apiAuth');
const { requireAdmin } = require('../middleware/auth');
const { selectDailyWinner } = require('../services/cronService');
const rateLimit = require('express-rate-limit');

// Rate limit: 100 requests per 15 minutes per IP
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.use(apiLimiter);

/**
 * @swagger
 * /api/v1/featured-alumnus:
 *   get:
 *     summary: Get today's featured alumnus
 *     description: Returns the full profile of the alumni currently featured for today.
 *     tags: [Public API]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successful response with featured alumnus data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/FeaturedAlumnus'
 *       401:
 *         description: Unauthorized - invalid or missing token
 *       404:
 *         description: No featured alumnus selected yet today
 *       429:
 *         description: Too many requests
 */
router.get('/featured-alumnus', requireApiToken, requireScope('read:alumni_of_day'), apiController.getTodaysFeaturedAlumnus);

/**
 * @swagger
 * /api/v1/alumni/{id}:
 *   get:
 *     summary: Get alumni profile by ID
 *     tags: [Public API]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: MongoDB ObjectId of the profile
 *     responses:
 *       200:
 *         description: Alumni profile data
 *       400:
 *         description: Invalid ID format
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Profile not found
 */
router.get('/alumni/:id', requireApiToken, requireScope('read:alumni'), apiController.getAlumnusById);

// ─── ALUMNI LIST ──────────────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/alumni:
 *   get:
 *     summary: List all alumni
 *     description: Returns lightweight profiles for all alumni. Supports ?programme= and ?sector= filters.
 *     tags: [Analytics API]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: programme
 *         schema:
 *           type: string
 *         description: Filter by degree programme name (partial match)
 *       - in: query
 *         name: sector
 *         schema:
 *           type: string
 *         description: Filter by employer/company name (partial match)
 *     responses:
 *       200:
 *         description: List of alumni
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — token lacks read:alumni permission
 */
router.get('/alumni', requireApiToken, requireScope('read:alumni'), analyticsController.getAllAlumni);

// ─── ANALYTICS ENDPOINTS ──────────────────────────────────────────────────────

/**
 * @swagger
 * /api/v1/analytics/summary:
 *   get:
 *     summary: Dashboard summary cards
 *     description: Returns top-level counts — total alumni, employment rate, certification count, etc.
 *     tags: [Analytics API]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Summary stats object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden — token lacks read:analytics permission
 */
router.get('/analytics/summary', requireApiToken, requireScope('read:analytics'), analyticsController.getSummary);

/**
 * @swagger
 * /api/v1/analytics/certifications:
 *   get:
 *     summary: Certification trends
 *     description: Certifications completed per year + top providers. Use for line/bar charts.
 *     tags: [Analytics API]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Certification trend data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/analytics/certifications', requireApiToken, requireScope('read:analytics'), analyticsController.getCertificationTrends);

/**
 * @swagger
 * /api/v1/analytics/employment:
 *   get:
 *     summary: Employment sector breakdown
 *     description: Top employers, top job roles, and currently-employed vs not. Use for bar/doughnut charts.
 *     tags: [Analytics API]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Employment breakdown data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/analytics/employment', requireApiToken, requireScope('read:analytics'), analyticsController.getEmploymentBreakdown);

/**
 * @swagger
 * /api/v1/analytics/skills:
 *   get:
 *     summary: Skills gap overview
 *     description: Top degrees, certifications, courses, and licences across all alumni.
 *     tags: [Analytics API]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Skills distribution data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/analytics/skills', requireApiToken, requireScope('read:analytics'), analyticsController.getSkillsOverview);

/**
 * @swagger
 * /api/v1/analytics/career-pathways:
 *   get:
 *     summary: Career pathways
 *     description: Maps degree programmes to the job roles alumni went on to hold.
 *     tags: [Analytics API]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Career pathway data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.get('/analytics/career-pathways', requireApiToken, requireScope('read:analytics'), analyticsController.getCareerPathways);

/**
 * POST /api/v1/admin/trigger-winner
 * Admin-only: manually trigger winner selection for testing.
 * Uses testMode=true so it processes TODAY's bids (not yesterday's).
 * Redirects back to admin dashboard with a result message.
 */
router.post('/admin/trigger-winner', requireAdmin, async (req, res) => {
  try {
    const result = await selectDailyWinner(true); // testMode = true

    if (result && result.skipped) {
      req.session.error = 'A winner was already selected for today. Delete the DailyWinner record in MongoDB to re-run.';
    } else if (result && result.noBids) {
      req.session.error = 'No active bids found for today. Place a bid on the bidding page first, then try again.';
    } else {
      req.session.success = `✅ Winner selected! Now test GET /api/v1/featured-alumnus in Postman.`;
    }

    res.redirect('/admin');
  } catch (err) {
    req.session.error = `Winner selection failed: ${err.message}`;
    res.redirect('/admin');
  }
});

module.exports = router;
