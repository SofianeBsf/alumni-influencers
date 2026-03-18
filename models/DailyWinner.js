/**
 * DailyWinner Model
 * Records which alumni won the featured slot for each day.
 * This is the record the public API reads to return "today's featured alumnus".
 */

const mongoose = require('mongoose');

const DailyWinnerSchema = new mongoose.Schema(
  {
    // The date this winner is featured (YYYY-MM-DD, stored as Date)
    featureDate: {
      type: Date,
      required: true,
      unique: true,
      index: true,
    },

    user:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',    required: true },
    profile: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true },
    bid:     { type: mongoose.Schema.Types.ObjectId, ref: 'Bid',     required: true },

    // Winning amount stored for internal records (never exposed publicly)
    winningAmount: { type: Number, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DailyWinner', DailyWinnerSchema);
