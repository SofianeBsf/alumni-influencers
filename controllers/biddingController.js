/**
 * Bidding Controller
 * Handles the blind bidding system for daily featured alumni slots.
 *
 * Blind bidding rules:
 * - Alumni cannot see the current highest bid amount
 * - Alumni can only receive win/lose status feedback
 * - Bids can only be increased, never decreased
 * - Max 3 wins per calendar month (4 if attended an alumni event that month)
 * - Winner selected automatically at midnight by cronService
 */

const Bid = require('../models/Bid');
const Profile = require('../models/Profile');
const User = require('../models/User');
const DailyWinner = require('../models/DailyWinner');

/** Get midnight UTC for today (the bidding day key). */
const getTodayMidnightUTC = () => {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/** Get YYYY-MM string for current month. */
const getCurrentMonthYear = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

/** Count wins in the current calendar month. */
const getMonthlyWinCount = async (userId) => {
  const monthYear = getCurrentMonthYear();
  return Bid.countDocuments({ user: userId, status: 'won', monthYear });
};

/** Check if user attended an alumni event this month (grants 4th bid slot). */
const hasEventAttendanceThisMonth = async (userId) => {
  const monthYear = getCurrentMonthYear();
  const user = await User.findById(userId);
  if (!user || !user.alumniEventAttendance) return false;
  return user.alumniEventAttendance.some((e) => e.monthYear === monthYear);
};

// ─── GET BIDDING PAGE ─────────────────────────────────────────────────────────

const getBiddingPage = async (req, res) => {
  try {
    const today = getTodayMidnightUTC();

    // User's current bid for today's round
    const myBid = await Bid.findOne({ user: req.session.userId, bidDay: today });

    // Monthly win count and limit
    const winCount = await getMonthlyWinCount(req.session.userId);
    const hasEvent = await hasEventAttendanceThisMonth(req.session.userId);
    const monthlyLimit = hasEvent ? 4 : 3;
    const remainingSlots = Math.max(0, monthlyLimit - winCount);

    // How many alumni are bidding today (count only — no amounts revealed)
    const totalBidders = await Bid.countDocuments({ bidDay: today, status: 'active' });

    // Bidding runs all day — cron closes it at midnight
    const biddingOpen = true;

    // Show who is featured TODAY (selected from yesterday's bids at midnight)
    const todaysWinner = await DailyWinner.findOne({ featureDate: today })
      .populate({ path: 'profile', select: 'firstName lastName profileImage' });

    // Persistent win/lose status — recompute from DB every page load
    let isWinning = null;
    if (myBid && myBid.status === 'active') {
      isWinning = await checkIfWinning(req.session.userId, today, myBid.amount);
    }

    res.render('bidding/bid', {
      title: 'Place a Bid',
      myBid,
      winCount,
      monthlyLimit,
      remainingSlots,
      totalBidders,
      biddingOpen,
      todaysWinner,
      isWinning,
      errors: req.session.validationErrors || [],
    });
    delete req.session.validationErrors;
  } catch (err) {
    console.error('[Bidding] getBiddingPage error:', err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load bidding page.' });
  }
};

// ─── PLACE BID ────────────────────────────────────────────────────────────────

const placeBid = async (req, res) => {
  try {
    const { amount } = req.body;
    const today = getTodayMidnightUTC();
    const monthYear = getCurrentMonthYear();

    // Must have a profile
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

    // Cannot place a second bid on the same day
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

    req.session.success = 'Bid placed successfully! Your current status is shown below.';
    res.redirect('/bidding');
  } catch (err) {
    console.error('[Bidding] placeBid error:', err);
    req.session.error = 'Failed to place bid. Please try again.';
    res.redirect('/bidding');
  }
};

// ─── UPDATE BID ───────────────────────────────────────────────────────────────

const updateBid = async (req, res) => {
  try {
    const { amount } = req.body;
    const today = getTodayMidnightUTC();
    const newAmount = parseFloat(amount);

    const existingBid = await Bid.findOne({ user: req.session.userId, bidDay: today });
    if (!existingBid) {
      req.session.error = 'No existing bid found for today.';
      return res.redirect('/bidding');
    }

    if (existingBid.status !== 'active') {
      req.session.error = 'This bid has already been finalised and cannot be changed.';
      return res.redirect('/bidding');
    }

    // Enforce increase-only rule
    if (newAmount <= existingBid.amount) {
      req.session.error = `New bid must be higher than your current bid of £${existingBid.amount.toFixed(2)}.`;
      return res.redirect('/bidding');
    }

    // Record audit trail
    existingBid.updateHistory.push({ previousAmount: existingBid.amount, newAmount });
    existingBid.amount = newAmount;
    await existingBid.save();

    req.session.success = 'Bid updated! Your current status is shown below.';
    res.redirect('/bidding');
  } catch (err) {
    console.error('[Bidding] updateBid error:', err);
    req.session.error = 'Failed to update bid.';
    res.redirect('/bidding');
  }
};

// ─── CANCEL BID ───────────────────────────────────────────────────────────────

const cancelBid = async (req, res) => {
  try {
    const today = getTodayMidnightUTC();

    const existingBid = await Bid.findOne({ user: req.session.userId, bidDay: today });
    if (!existingBid) {
      req.session.error = 'No active bid found for today.';
      return res.redirect('/bidding');
    }

    if (existingBid.status !== 'active') {
      req.session.error = 'This bid has already been finalised and cannot be cancelled.';
      return res.redirect('/bidding');
    }

    await Bid.deleteOne({ _id: existingBid._id });

    req.session.success = 'Your bid has been cancelled successfully.';
    res.redirect('/bidding');
  } catch (err) {
    console.error('[Bidding] cancelBid error:', err);
    req.session.error = 'Failed to cancel bid.';
    res.redirect('/bidding');
  }
};

// ─── HELPER: CHECK WIN STATUS ─────────────────────────────────────────────────

/**
 * Returns true if the given user's bid is currently the highest for today.
 * Only reveals relative position — never the actual winning amount.
 */
const checkIfWinning = async (userId, bidDay, amount) => {
  const highestBid = await Bid.findOne({ bidDay, status: 'active' })
    .sort({ amount: -1 })
    .select('user amount');

  if (!highestBid) return true;
  return highestBid.user.toString() === userId.toString();
};

// ─── BID HISTORY ──────────────────────────────────────────────────────────────

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

module.exports = { getBiddingPage, placeBid, updateBid, cancelBid, getBidHistory };
