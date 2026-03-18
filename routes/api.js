/**
 * Public API Routes
 * All routes protected by Bearer token authentication.
 * Rate limiting applied to prevent abuse.
 */

const express = require('express');
const router = express.Router();
const apiController = require('../controllers/apiController');
const { requireApiToken } = require('../middleware/apiAuth');
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
router.use(requireApiToken);

/**
 * @swagger
 * /api/v1/today:
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
router.get('/today', apiController.getTodaysFeaturedAlumnus);

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
router.get('/alumni/:id', apiController.getAlumnusById);

module.exports = router;
