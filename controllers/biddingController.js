/**
 * Bidding Controller
 * Handles the blind bidding system for daily featured alumni slots.
 *
 * Blind bidding rules:
 * - Alumni cannot see the current highest bid
 * - Alumni can only receive win/lose feedback
 * - Bids can only be increased, never decreased
 * - Max 3 wins per calendar month (4 if attended an alumni event that month)
 * - Automated winner selection happens at 6 PM (handled by cronService)
 */

const Bid = require('../models/Bid');
const Profile = require('../models/Profile');
const User = require('../models/User');
const DailyWinner = require('../models/DailyWinner');

/**
 * Get midnight UTC for today (the bidding day key).
 */
const getTodayMidnightUTC = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/**
 * Get YYYY-MM string for current month.
 */
const getCurrentMonthYear = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Count how many times a user has WON in the current calendar month.
 */
const getMonthlyWinCount = async (userId) => {
  const monthYear = getCurrentMonthYear();
  return Bid.countDocuments({ user: userId, status: 'won', monthYear });
};

/**
 * Check if user attended an alumni event this month (grants 4th bid slot).
 */
const hasEventAttendanceThisMonth = async (userId) => {
  const monthYear = getCurrentMonthYear();
  const user = await User.findById(userId);
  if (!user || !user.alumniEventAttendance) return false;
  return user.alumniEventAttendance.some((e) => e.monthYear === monthYear);
};

// ─── GET BIDDING PAGE ─────────────────────────────────────────────────────────

/**
 * GET /bidding
 * Shows the bidding interface with current bid status and monthly limit info.
 */
const getBiddingPage = async (req, res) => {
  try {
    const today = getTodayMidnightUTC();
    const monthYear = getCurrentMonthYear();

    // Get user's current bid for today (if any)
    const myBid = await Bid.findOne({ user: req.session.userId, bidDay: today });

    // Monthly win count
    const winCount = await getMonthlyWinCount(req.session.userId);
    const hasEvent = await hasEventAttendanceThisMonth(req.session.userId);
    const monthlyLimit = hasEvent ? 4 : 3;
    const remainingSlots = Math.max(0, monthlyLimit - winCount);

    // Count of active bids today (without revealing amounts) — just show how many are bidding
    const totalBidders = await Bid.countDocuments({ bidDay: today, status: 'active' });

    // Check if bidding is open (before 6 PM)
    const now = new Date();
    const biddingOpen = now.getUTCHours() < 18;

    // Get today's winner if already selected
    const tomorrow = new Date(today);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const todaysWinner = await DailyWinner.findOne({ featureDate: tomorrow })
      .populate({ path: 'profile', select: 'firstName lastName profileImage' });

    res.render('bidding/bid', {
      title: 'Place a Bid',
      myBid,
      winCount,
      monthlyLimit,
      remainingSlots,
      totalBidders,
      biddingOpen,
      todaysWinner,
      errors: req.session.validationErrors || [],
    });
    delete req.session.validationErrors;
  } catch (err) {
    console.error('[Bidding] getBiddingPage error:', err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load bidding page.' });
  }
};

// ─── PLACE BID ────────────────────────────────────────────────────────────────

/**
 * POST /bidding/place
 * Places a new bid for today's slot.
 */
const placeBid = async (req, res) => {
  try {
    const { amount } = req.body;
    const today = getTodayMidnightUTC();
    const monthYear = getCurrentMonthYear();

    // Check bidding window (must be before 6 PM)
    const now = new Date();
    if (now.getUTCHours() >= 18) {
      req.session.error = 'Bidding has closed for today (after 6 PM). Come back tomorrow!';
      return res.redirect('/bidding');
    }

    // Check if user has a profile
    const profile = await Profile.findOne({ user: req.session.userId });
    if (!profile) {
      req.session.error = 'You must complete your profile before placing a bid.';
      return res.redirect('/profile/create');
    }

    // Check monthly win limit
    const winCount = await getMonthlyWinCount(req.session.userId);
    const hasEvent = await hasEventAttendanceThisMonth(req.session.userId);
    const monthlyLimit = hasEvent ? 4 : 3;

    if (winCount >= monthlyLimit) {
      req.session.error = `You have reached your monthly limit of ${monthlyLimit} featured slots.`;
      return res.redirect('/bidding');
    }

    // Check if user already has a bid today
    const existingBid = await Bid.findOne({ user: req.session.userId, bidDay: today });
    if (existingBid) {
      req.session.error = 'You already have a bid for today. Use "Update Bid" to increase it.';
      return res.redirect('/bidding');
    }

    await Bid.create({
      user: req.session.userId,
      amount: parseFloat(amount),
      bidDay: today,
      monthYear,
    });

    // Determine win/loss status (blind — only relative feedback)
    const isCurrentlyWinning = await checkIfWinning(req.session.userId, today, parseFloat(amount));

    req.session.success = isCurrentlyWinning
      ? '✅ Bid placed! You are currently WINNING. Keep watching for updates!'
      : '⚠️ Bid placed, but you are currently LOSING. Consider updating your bid.';

    res.redirect('/bidding');
  } catch (err) {
    console.error('[Bidding] placeBid error:', err);
    req.session.error = 'Failed to place bid. Please try again.';
    res.redirect('/bidding');
  }
};

// ─── UPDATE BID ───────────────────────────────────────────────────────────────

/**
 * POST /bidding/update
 * Increases an existing bid. Decrease is not allowed.
 */
const updateBid = async (req, res) => {
  try {
    const { amount } = req.body;
    const today = getTodayMidnightUTC();
    const newAmount = parseFloat(amount);

    // Check bidding window
    const now = new Date();
    if (now.getUTCHours() >= 18) {
      req.session.error = 'Bidding has closed for today (after 6 PM).';
      return res.redirect('/bidding');
    }

    const existingBid = await Bid.findOne({ user: req.session.userId, bidDay: today });
    if (!existingBid) {
      req.session.error = 'No existing bid found for today.';
      return res.redirect('/bidding');
    }

    // Enforce increase-only rule
    if (newAmount <= existingBid.amount) {
      req.session.error = `New bid must be higher than your current bid of £${existingBid.amount.toFixed(2)}.`;
      return res.redirect('/bidding');
    }

    // Record update history for audit trail
    existingBid.updateHistory.push({
      previousAmount: existingBid.amount,
      newAmount,
    });
    existingBid.amount = newAmount;
    await existingBid.save();

    const isCurrentlyWinning = await checkIfWinning(req.session.userId, today, newAmount);

    req.session.success = isCurrentlyWinning
      ? '✅ Bid updated! You are currently WINNING!'
      : '⚠️ Bid updated, but you are still LOSING. Consider bidding higher.';

    res.redirect('/bidding');
  } catch (err) {
    console.error('[Bidding] updateBid error:', err);
    req.session.error = 'Failed to update bid.';
    res.redirect('/bidding');
  }
};

// ─── HELPER: CHECK WIN STATUS ─────────────────────────────────────────────────

/**
 * Check if a given user's bid is currently the highest for today.
 * This is the ONLY information revealed — not the actual highest amount.
 * @returns {boolean} true if this user is currently winning
 */
const checkIfWinning = async (userId, bidDay, amount) => {
  const highestBid = await Bid.findOne({ bidDay, status: 'active' })
    .sort({ amount: -1 })
    .select('user amount');

  if (!highestBid) return true; // First bidder is always winning
  return highestBid.user.toString() === userId.toString();
};

// ─── BID HISTORY ──────────────────────────────────────────────────────────────

/**
 * GET /bidding/history
 * Shows the current user's bid history.
 */
const getBidHistory = async (req, res) => {
  try {
    const bids = await Bid.find({ user: req.session.userId })
      .sort({ bidDay: -1 })
      .limit(30);

    res.render('bidding/history', { title: 'My Bid History', bids });
  } catch (err) {
    console.error('[Bidding] getBidHistory error:', err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load bid history.' });
  }
};

module.exports = { getBiddingPage, placeBid, updateBid, getBidHistory };
