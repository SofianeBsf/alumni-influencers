/**
 * Cron Service
 * Scheduled jobs using node-cron.
 *
 * Jobs:
 * 1. Daily Winner Selection — runs at midnight (00:00) every day.
 *    Selects the highest bidder for YESTERDAY's bids, marks them as winner,
 *    creates a DailyWinner record for TODAY's featured slot,
 *    and sends email notifications to all bidders.
 *
 * 2. Stale bid cleanup — runs at 00:01 AM every day.
 *    Failsafe: marks any leftover 'active' bids from previous days as 'lost'.
 *
 * Timeline example:
 *   Monday:   users place bids (bidDay = Monday midnight)
 *   Midnight: cron runs, picks winner from Monday's bids,
 *             creates DailyWinner for Tuesday
 *   Tuesday:  winner is featured; new bidding round begins for Wednesday
 */

const cron = require('node-cron');
const Bid = require('../models/Bid');
const DailyWinner = require('../models/DailyWinner');
const Profile = require('../models/Profile');
const User = require('../models/User');
const { sendWinNotification, sendLossNotification } = require('./emailService');

/**
 * Get midnight UTC Date for a given date (defaults to now).
 */
const getMidnightUTC = (date = new Date()) => {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

/**
 * Format a date for use in email bodies.
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
 * Core winner selection logic — exported for testability and manual triggering.
 *
 * Runs at midnight of day X. At that point:
 *   - yesterday = day X-1 (the bidding day that just ended)
 *   - today     = day X   (the feature date — who appears today)
 */
/**
 * @param {boolean} testMode - If true, processes TODAY's bids instead of yesterday's.
 *                             Used by the admin manual trigger for testing.
 */
const selectDailyWinner = async (testMode = false) => {
  const now = new Date();
  // Normal (midnight cron): process yesterday's bids, feature winner today
  // Test mode (manual trigger): process today's bids, feature winner today
  const bidDay = testMode
    ? getMidnightUTC(now)                                              // today's bids
    : getMidnightUTC(new Date(now.getTime() - 24 * 60 * 60 * 1000)); // yesterday's bids
  const featureDate = getMidnightUTC(now); // winner always featured today

  const bidDayStr = bidDay.toISOString().substring(0, 10);
  console.log(`[CRON] Running winner selection for bids from ${bidDayStr} (testMode=${testMode})`);

  try {
    // Avoid double-running
    const existingWinner = await DailyWinner.findOne({ featureDate });
    if (existingWinner) {
      console.log('[CRON] Winner already selected for this feature date, skipping.');
      return { skipped: true };
    }

    // Fetch all active bids for the bid day, highest first
    const bids = await Bid.find({ bidDay, status: 'active' })
      .sort({ amount: -1 })
      .populate('user');

    if (bids.length === 0) {
      console.log('[CRON] No active bids found. No winner selected.');
      return { noBids: true };
    }

    const winningBid = bids[0];
    const losingBids = bids.slice(1);

    // Mark winner
    winningBid.status = 'won';
    await winningBid.save();

    // Create DailyWinner record
    const profile = await Profile.findOne({ user: winningBid.user._id });
    if (profile) {
      await DailyWinner.create({
        featureDate,
        user: winningBid.user._id,
        profile: profile._id,
        bid: winningBid._id,
        winningAmount: winningBid.amount,
      });
      console.log(`[CRON] Winner: ${winningBid.user.email} — featured on ${featureDate.toISOString().substring(0, 10)}`);
    }

    // Mark losing bids
    const losingBidIds = losingBids.map((b) => b._id);
    await Bid.updateMany({ _id: { $in: losingBidIds } }, { status: 'lost' });

    // Send email notifications
    const featureDateStr = formatDate(featureDate);

    if (profile) {
      await sendWinNotification(winningBid.user.email, profile.firstName, featureDateStr).catch(
        (err) => console.error('[CRON] Failed to send win email:', err.message)
      );
      winningBid.notificationSent = true;
      await winningBid.save();
    }

    for (const bid of losingBids) {
      const loserProfile = await Profile.findOne({ user: bid.user._id });
      if (loserProfile) {
        await sendLossNotification(bid.user.email, loserProfile.firstName, featureDateStr).catch(
          (err) => console.error('[CRON] Failed to send loss email:', err.message)
        );
        bid.notificationSent = true;
        await bid.save();
      }
    }

    console.log(`[CRON] Winner selection complete. ${losingBids.length} losers notified.`);
    return { winner: winningBid.user.email };
  } catch (err) {
    console.error('[CRON] Error during winner selection:', err);
    throw err;
  }
};

/**
 * Initialise all cron jobs. Called once from app.js after DB connection.
 *
 * IMPORTANT: Both jobs use { timezone: 'UTC' } so they fire at midnight UTC
 * regardless of the server's local system timezone. All bid dates are stored
 * as UTC midnight via getMidnightUTC(), so the cron MUST also run at UTC
 * midnight for the bidDay date comparison to match correctly.
 *
 * Without this, on a server in BST (UTC+1) the cron would fire at 23:00 UTC
 * (local midnight), and getMidnightUTC(now - 24h) would produce the wrong day,
 * causing the query to find zero bids.
 */
const initCronJobs = () => {
  // Job 1: Winner selection at midnight UTC every day
  cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] Midnight UTC job triggered: selecting daily winner');
    await selectDailyWinner();
  }, { timezone: 'UTC' });

  // Job 2: Failsafe cleanup at 00:01 UTC — marks stale active bids as lost
  cron.schedule('1 0 * * *', async () => {
    await Bid.updateMany(
      { bidDay: { $lt: getMidnightUTC() }, status: 'active' },
      { status: 'lost' }
    );
    console.log('[CRON] Cleanup: stale active bids marked as lost.');
  }, { timezone: 'UTC' });

  console.log('[CRON] Scheduled jobs initialised (winner selection: 00:00 UTC daily)');
};

module.exports = { initCronJobs, selectDailyWinner };
