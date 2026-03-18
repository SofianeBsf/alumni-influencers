/**
 * Cron Service
 * Scheduled jobs using node-cron.
 *
 * Jobs:
 * 1. Daily Winner Selection — runs at 6:00 PM every day.
 *    Selects the highest bidder for that day, marks them as winner,
 *    creates a DailyWinner record for tomorrow's featured slot,
 *    and sends email notifications to all bidders.
 *
 * 2. Midnight cleanup — runs at 00:01 AM every day.
 *    Marks any leftover 'active' bids from the previous day as 'lost'.
 */

const cron = require('node-cron');
const Bid = require('../models/Bid');
const DailyWinner = require('../models/DailyWinner');
const Profile = require('../models/Profile');
const User = require('../models/User');
const { sendWinNotification, sendLossNotification } = require('./emailService');

/**
 * Get midnight UTC Date for a given date string or today.
 */
const getMidnightUTC = (date = new Date()) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/**
 * Format a date to a readable string for emails.
 */
const formatDate = (date) => {
  return new Date(date).toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

/**
 * Core winner selection logic (extracted for testability and manual triggering).
 * Selects the highest active bid for today, marks it as won, marks others as lost,
 * creates a DailyWinner record for the next day's feature, and sends notifications.
 */
const selectDailyWinner = async () => {
  const today = getMidnightUTC();
  const tomorrow = getMidnightUTC(new Date(Date.now() + 24 * 60 * 60 * 1000));

  // YYYY-MM string for today
  const todayStr = today.toISOString().substring(0, 10);

  console.log(`[CRON] Running winner selection for ${todayStr}`);

  try {
    // Check if winner already selected for tomorrow to avoid double-running
    const existingWinner = await DailyWinner.findOne({ featureDate: tomorrow });
    if (existingWinner) {
      console.log('[CRON] Winner already selected for tomorrow, skipping.');
      return;
    }

    // Fetch all active bids for today, sorted highest first
    const bids = await Bid.find({ bidDay: today, status: 'active' })
      .sort({ amount: -1 })
      .populate('user');

    if (bids.length === 0) {
      console.log('[CRON] No active bids for today. No winner selected.');
      return;
    }

    const winningBid = bids[0];
    const losingBids = bids.slice(1);

    // --- Mark winner ---
    winningBid.status = 'won';
    await winningBid.save();

    // --- Create DailyWinner record for tomorrow ---
    const profile = await Profile.findOne({ user: winningBid.user._id });
    if (profile) {
      await DailyWinner.create({
        featureDate: tomorrow,
        user: winningBid.user._id,
        profile: profile._id,
        bid: winningBid._id,
        winningAmount: winningBid.amount,
      });
      console.log(`[CRON] Winner: ${winningBid.user.email} with bid £${winningBid.amount}`);
    }

    // --- Mark all losing bids as lost ---
    const losingBidIds = losingBids.map((b) => b._id);
    await Bid.updateMany({ _id: { $in: losingBidIds } }, { status: 'lost' });

    // --- Send email notifications ---
    const tomorrowDateStr = formatDate(tomorrow);

    // Notify winner
    if (profile) {
      await sendWinNotification(winningBid.user.email, profile.firstName, tomorrowDateStr).catch(
        (err) => console.error('[CRON] Failed to send win email:', err.message)
      );
      winningBid.notificationSent = true;
      await winningBid.save();
    }

    // Notify losers
    for (const bid of losingBids) {
      const loserProfile = await Profile.findOne({ user: bid.user._id });
      if (loserProfile) {
        await sendLossNotification(bid.user.email, loserProfile.firstName, tomorrowDateStr).catch(
          (err) => console.error('[CRON] Failed to send loss email:', err.message)
        );
        bid.notificationSent = true;
        await bid.save();
      }
    }

    console.log(`[CRON] Winner selection complete. ${losingBids.length} losers notified.`);
  } catch (err) {
    console.error('[CRON] Error during winner selection:', err);
  }
};

/**
 * Initialise all cron jobs.
 * Called once from app.js after DB connection.
 */
const initCronJobs = () => {
  // --- Job 1: Daily winner selection at 6:00 PM (18:00) ---
  cron.schedule('0 18 * * *', async () => {
    console.log('[CRON] 6 PM job triggered: selecting daily winner');
    await selectDailyWinner();
  });

  // --- Job 2: Cleanup stale active bids at 00:01 AM ---
  // Marks any still-active bids from previous days as lost (failsafe)
  cron.schedule('1 0 * * *', async () => {
    const yesterday = getMidnightUTC(new Date(Date.now() - 24 * 60 * 60 * 1000));
    await Bid.updateMany(
      { bidDay: { $lt: getMidnightUTC() }, status: 'active' },
      { status: 'lost' }
    );
    console.log('[CRON] Cleanup: stale active bids marked as lost.');
  });

  console.log('[CRON] Scheduled jobs initialised (winner selection: 6 PM daily)');
};

module.exports = { initCronJobs, selectDailyWinner };
