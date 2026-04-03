/**
 * Analytics Controller
 * Provides aggregated alumni data endpoints for the CW2 dashboard client.
 * All routes protected by Bearer token + require 'read:analytics' scope.
 *
 * Endpoints:
 *   GET /api/v1/alumni                   — list all alumni (requires read:alumni)
 *   GET /api/v1/analytics/certifications — certification trends by year
 *   GET /api/v1/analytics/employment     — employment sector breakdown
 *   GET /api/v1/analytics/skills         — skills gap (degree/cert distribution)
 *   GET /api/v1/analytics/career-pathways— degree programme → job role mapping
 *   GET /api/v1/analytics/summary        — top-level numbers for dashboard cards
 */

const Profile = require('../models/Profile');
const DailyWinner = require('../models/DailyWinner');

// ─── LIST ALL ALUMNI ──────────────────────────────────────────────────────────

/**
 * GET /api/v1/alumni
 * Returns a lightweight list of all alumni profiles.
 * Excludes sensitive sub-documents to keep payload small.
 * Supports optional ?programme=&sector= query filters.
 */
const getAllAlumni = async (req, res) => {
  try {
    const { programme, sector, graduationYear } = req.query;

    const matchStage = {};

    // Filter by degree name (programme)
    if (programme) {
      matchStage['degrees.name'] = { $regex: programme, $options: 'i' };
    }

    // Filter by employment sector / company
    if (sector) {
      matchStage['employment.company'] = { $regex: sector, $options: 'i' };
    }

    // Filter by graduation year (any degree completed in that year)
    if (graduationYear && !isNaN(parseInt(graduationYear))) {
      const year = parseInt(graduationYear);
      matchStage['degrees.completionDate'] = {
        $gte: new Date(`${year}-01-01`),
        $lte: new Date(`${year}-12-31`),
      };
    }

    const profiles = await Profile.find(matchStage)
      .select('firstName lastName bio linkedinUrl profileImage degrees employment createdAt')
      .populate('user', 'email')
      .sort({ lastName: 1 });

    res.json({
      success: true,
      count: profiles.length,
      data: profiles.map((p) => ({
        id: p._id,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.user ? p.user.email : null,
        bio: p.bio,
        linkedinUrl: p.linkedinUrl,
        profileImage: p.profileImage
          ? `${process.env.APP_URL}${p.profileImage}`
          : null,
        degreeCount: p.degrees.length,
        latestDegree: p.degrees.length > 0 ? p.degrees[p.degrees.length - 1].name : null,
        currentEmployer: p.employment.find((e) => e.isCurrent)?.company || null,
        memberSince: p.createdAt,
      })),
    });
  } catch (err) {
    console.error('[Analytics] getAllAlumni error:', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
};

// ─── SUMMARY CARDS ────────────────────────────────────────────────────────────

/**
 * GET /api/v1/analytics/summary
 * Top-level counts for dashboard stat cards.
 */
const getSummary = async (req, res) => {
  try {
    const [
      totalAlumni,
      alumniWithEmployment,
      totalCertifications,
      totalDegrees,
      totalWinners,
    ] = await Promise.all([
      Profile.countDocuments(),
      Profile.countDocuments({ 'employment.0': { $exists: true } }),
      Profile.aggregate([
        { $project: { count: { $size: '$certifications' } } },
        { $group: { _id: null, total: { $sum: '$count' } } },
      ]),
      Profile.aggregate([
        { $project: { count: { $size: '$degrees' } } },
        { $group: { _id: null, total: { $sum: '$count' } } },
      ]),
      DailyWinner.countDocuments(),
    ]);

    res.json({
      success: true,
      data: {
        totalAlumni,
        alumniWithEmployment,
        employmentRate: totalAlumni > 0
          ? Math.round((alumniWithEmployment / totalAlumni) * 100)
          : 0,
        totalCertifications: totalCertifications[0]?.total || 0,
        totalDegrees: totalDegrees[0]?.total || 0,
        totalFeaturedWinners: totalWinners,
      },
    });
  } catch (err) {
    console.error('[Analytics] getSummary error:', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
};

// ─── CERTIFICATIONS TREND ─────────────────────────────────────────────────────

/**
 * GET /api/v1/analytics/certifications
 * Counts certifications completed per year (last 10 years).
 * Also returns top certification providers.
 */
const getCertificationTrends = async (req, res) => {
  try {
    const [byYear, byProvider] = await Promise.all([
      // Certifications grouped by completion year
      Profile.aggregate([
        { $unwind: '$certifications' },
        {
          $group: {
            _id: { $year: '$certifications.completionDate' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 10 },
        { $project: { year: '$_id', count: 1, _id: 0 } },
      ]),

      // Top certification providers (institutions)
      Profile.aggregate([
        { $unwind: '$certifications' },
        {
          $group: {
            _id: '$certifications.institution',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $project: { provider: '$_id', count: 1, _id: 0 } },
      ]),
    ]);

    res.json({
      success: true,
      data: { byYear, byProvider },
    });
  } catch (err) {
    console.error('[Analytics] getCertificationTrends error:', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
};

// ─── EMPLOYMENT SECTORS ───────────────────────────────────────────────────────

/**
 * GET /api/v1/analytics/employment
 * Breaks down alumni employment by sector/company and role distribution.
 * "Sector" is approximated from company name as no explicit sector field exists.
 */
const getEmploymentBreakdown = async (req, res) => {
  try {
    const [topCompanies, topRoles, currentVsPast] = await Promise.all([
      // Most common employers
      Profile.aggregate([
        { $unwind: '$employment' },
        {
          $group: {
            _id: '$employment.company',
            alumniCount: { $sum: 1 },
          },
        },
        { $sort: { alumniCount: -1 } },
        { $limit: 10 },
        { $project: { company: '$_id', alumniCount: 1, _id: 0 } },
      ]),

      // Most common job roles
      Profile.aggregate([
        { $unwind: '$employment' },
        {
          $group: {
            _id: '$employment.role',
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $project: { role: '$_id', count: 1, _id: 0 } },
      ]),

      // Currently employed vs not
      Profile.aggregate([
        {
          $project: {
            hasCurrentJob: {
              $gt: [
                {
                  $size: {
                    $filter: {
                      input: '$employment',
                      as: 'e',
                      cond: { $eq: ['$$e.isCurrent', true] },
                    },
                  },
                },
                0,
              ],
            },
          },
        },
        {
          $group: {
            _id: '$hasCurrentJob',
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    // Format currentVsPast into a friendly shape
    const employed = currentVsPast.find((r) => r._id === true)?.count || 0;
    const notCurrentlyEmployed = currentVsPast.find((r) => r._id === false)?.count || 0;

    res.json({
      success: true,
      data: {
        topCompanies,
        topRoles,
        employmentStatus: {
          currentlyEmployed: employed,
          notCurrentlyEmployed,
        },
      },
    });
  } catch (err) {
    console.error('[Analytics] getEmploymentBreakdown error:', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
};

// ─── SKILLS GAP ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/analytics/skills
 * Identifies most common degree programmes and certifications.
 * Helps universities spot skills gaps in alumni cohorts.
 */
const getSkillsOverview = async (req, res) => {
  try {
    const [topDegrees, topCertifications, topCourses, topLicences] = await Promise.all([
      // Most common degree names
      Profile.aggregate([
        { $unwind: '$degrees' },
        { $group: { _id: '$degrees.name', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $project: { name: '$_id', count: 1, _id: 0 } },
      ]),

      // Most common certifications
      Profile.aggregate([
        { $unwind: '$certifications' },
        { $group: { _id: '$certifications.name', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $project: { name: '$_id', count: 1, _id: 0 } },
      ]),

      // Most common online courses
      Profile.aggregate([
        { $unwind: '$courses' },
        { $group: { _id: '$courses.name', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $project: { name: '$_id', count: 1, _id: 0 } },
      ]),

      // Most common licences
      Profile.aggregate([
        { $unwind: '$licences' },
        { $group: { _id: '$licences.name', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        { $project: { name: '$_id', count: 1, _id: 0 } },
      ]),
    ]);

    res.json({
      success: true,
      data: { topDegrees, topCertifications, topCourses, topLicences },
    });
  } catch (err) {
    console.error('[Analytics] getSkillsOverview error:', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
};

// ─── CAREER PATHWAYS ─────────────────────────────────────────────────────────

/**
 * GET /api/v1/analytics/career-pathways
 * Maps degree programmes to the job roles alumni went on to hold.
 * Useful for showing students what careers their degree leads to.
 * Returns top 8 degree → role pairings.
 */
const getCareerPathways = async (req, res) => {
  try {
    const pathways = await Profile.aggregate([
      // Only alumni who have both a degree and employment history
      {
        $match: {
          'degrees.0': { $exists: true },
          'employment.0': { $exists: true },
        },
      },

      // Unwind degrees so we get one document per degree
      { $unwind: '$degrees' },

      // Unwind employment so we get one document per job
      { $unwind: '$employment' },

      // Group by degree name + job role
      {
        $group: {
          _id: {
            degree: '$degrees.name',
            role: '$employment.role',
          },
          count: { $sum: 1 },
        },
      },

      // Sort by most common pairing
      { $sort: { count: -1 } },
      { $limit: 15 },

      {
        $project: {
          degree: '$_id.degree',
          role: '$_id.role',
          count: 1,
          _id: 0,
        },
      },
    ]);

    // Also return unique degree programmes for filtering
    const programmes = await Profile.aggregate([
      { $unwind: '$degrees' },
      { $group: { _id: '$degrees.name' } },
      { $sort: { _id: 1 } },
      { $project: { name: '$_id', _id: 0 } },
    ]);

    res.json({
      success: true,
      data: {
        pathways,
        programmes: programmes.map((p) => p.name),
      },
    });
  } catch (err) {
    console.error('[Analytics] getCareerPathways error:', err);
    res.status(500).json({ success: false, error: 'Internal server error.' });
  }
};

module.exports = {
  getAllAlumni,
  getSummary,
  getCertificationTrends,
  getEmploymentBreakdown,
  getSkillsOverview,
  getCareerPathways,
};
