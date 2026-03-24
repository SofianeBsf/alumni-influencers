/**
 * Public API Controller
 * Provides the client-agnostic REST API endpoints.
 * All responses are JSON. Bearer token authentication required.
 *
 * Endpoints:
 *   GET  /api/v1/today          - Get today's featured alumnus
 *   GET  /api/v1/alumni/:id     - Get a specific alumni profile
 */

const DailyWinner = require('../models/DailyWinner');
const Profile = require('../models/Profile');

/**
 * GET /api/v1/today
 * Returns today's featured alumnus profile.
 * The winning bid amount is NEVER included in the response.
 *
 * @swagger
 * /api/v1/today:
 *   get:
 *     summary: Get today's featured alumnus
 *     tags: [Public API]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Today's featured alumnus profile
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/FeaturedAlumnus'
 *       404:
 *         description: No featured alumnus for today
 */
const getTodaysFeaturedAlumnus = async (req, res) => {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const winner = await DailyWinner.findOne({ featureDate: today })
      .populate({
        path: 'profile',
        select: '-__v',
        populate: { path: 'user', select: 'email' },
      });

    if (!winner) {
      return res.status(404).json({
        success: false,
        message: 'No featured alumnus for today yet. The winner is selected automatically at midnight.',
      });
    }

    // Build the public response — deliberately exclude the bid amount
    const p = winner.profile;
    res.json({
      success: true,
      data: {
        featuredDate: winner.featureDate,
        alumnus: {
          id: p._id,
          firstName: p.firstName,
          lastName: p.lastName,
          bio: p.bio,
          linkedinUrl: p.linkedinUrl,
          profileImage: p.profileImage
            ? `${process.env.APP_URL}${p.profileImage}`
            : null,
          degrees:        p.degrees,
          certifications: p.certifications,
          licences:       p.licences,
          courses:        p.courses,
          employment:     p.employment,
        },
      },
    });
  } catch (err) {
    console.error('[API] getTodaysFeaturedAlumnus error:', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
};

/**
 * GET /api/v1/alumni/:id
 * Returns a specific alumni's public profile by profile ID.
 *
 * @swagger
 * /api/v1/alumni/{id}:
 *   get:
 *     summary: Get a specific alumni profile by ID
 *     tags: [Public API]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: The profile ID
 *     responses:
 *       200:
 *         description: Alumni profile
 *       404:
 *         description: Profile not found
 */
const getAlumnusById = async (req, res) => {
  try {
    const profile = await Profile.findById(req.params.id).select('-__v');
    if (!profile) {
      return res.status(404).json({ success: false, error: 'Profile not found.' });
    }
    res.json({ success: true, data: profile });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, error: 'Invalid profile ID.' });
    }
    console.error('[API] getAlumnusById error:', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
};

module.exports = { getTodaysFeaturedAlumnus, getAlumnusById };
