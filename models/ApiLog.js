/**
 * ApiLog Model
 * Records every API request made by an ApiClient.
 * Used for usage statistics, auditing, and abuse detection.
 * Indexed for fast time-range and client-based queries.
 */

const mongoose = require('mongoose');

const ApiLogSchema = new mongoose.Schema(
  {
    // Which client made this request (null = unauthenticated/failed attempt)
    client: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ApiClient',
      default: null,
      index: true,
    },

    // Request details
    endpoint:  { type: String, required: true },
    method:    { type: String, required: true, uppercase: true },
    ipAddress: { type: String },

    // Response status code
    statusCode: { type: Number },

    // Whether auth was successful
    authSuccess: { type: Boolean, default: false },

    // Token prefix used (for identifying which token was used even if client lookup failed)
    tokenPrefix: { type: String, default: null },
  },
  {
    timestamps: true, // createdAt = the request timestamp
  }
);

// Index on createdAt for time-range statistics queries
ApiLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ApiLog', ApiLogSchema);
