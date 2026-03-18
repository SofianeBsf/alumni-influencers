/**
 * Bid Model
 * Tracks individual bids placed by alumni for the daily featured slot.
 *
 * Key design decisions:
 * - monthYear field (YYYY-MM) allows fast indexed queries for monthly limits
 * - amount is stored but NEVER exposed to other alumni (blind bidding)
 * - status: 'active' = currently placed, 'won' = selected, 'lost' = not selected
 * - One active bid per user per bidding day (users can update/increase only)
 */

const mongoose = require('mongoose');

const BidSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // The bid amount (GBP). Never revealed to other bidders.
    amount: {
      type: Number,
      required: true,
      min: [1, 'Bid must be at least £1'],
    },

    // The calendar day this bid is for (YYYY-MM-DD stored as Date midnight UTC)
    bidDay: {
      type: Date,
      required: true,
      index: true,
    },

    // YYYY-MM string for fast monthly win-count queries
    monthYear: {
      type: String,
      required: true,
      index: true,
    },

    // Bid lifecycle status
    status: {
      type: String,
      enum: ['active', 'won', 'lost'],
      default: 'active',
      index: true,
    },

    // Whether the user has been notified of their win/loss
    notificationSent: { type: Boolean, default: false },

    // Track bid update history (increase only - audit trail)
    updateHistory: [
      {
        previousAmount: Number,
        newAmount: Number,
        updatedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

// Compound index: one active bid per user per day
BidSchema.index({ user: 1, bidDay: 1 }, { unique: true });

module.exports = mongoose.model('Bid', BidSchema);
