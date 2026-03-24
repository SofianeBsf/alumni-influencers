/**
 * Public API Routes
 * All routes protected by Bearer token authentication.
 * Rate limiting applied to prevent abuse.
 */

const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');
const { requireApiToken } = require('../middleware/apiAuth');
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
router.get('/featured-alumnus', requireApiToken, apiController.getTodaysFeaturedAlumnus);

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
router.get('/alumni/:id', requireApiToken, apiController.getAlumnusById);

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
