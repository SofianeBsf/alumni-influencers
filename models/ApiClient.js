/**
 * ApiClient Model
 * Represents an external client (e.g. the AR app) that accesses the public API.
 * Tokens are stored as a bcrypt hash — only the prefix is stored in plain text
 * for identification purposes (similar to how GitHub shows "ghp_...").
 */

const mongoose = require('mongoose');

const ApiClientSchema = new mongoose.Schema(
  {
    // Human-readable name for this client (e.g. "AR App v1", "Web Dashboard")
    name: { type: String, required: true, trim: true },

    // Short description of what this client does
    description: { type: String, trim: true },

    // First 8 chars of token shown for identification (e.g. "abc12345...")
    tokenPrefix: { type: String, required: true },

    // Full token hash (bcrypt) - never stored in plain text
    tokenHash: { type: String, required: true, select: false },

    // Granular permissions this client has been granted.
    // read:alumni_of_day  — GET /api/v1/featured-alumnus + /api/v1/alumni/:id
    // read:alumni         — GET /api/v1/alumni (list all alumni)
    // read:analytics      — GET /api/v1/analytics/* (aggregation endpoints)
    scope: {
      type: [String],
      enum: ['read:alumni_of_day', 'read:alumni', 'read:analytics'],
      default: ['read:alumni_of_day'],
    },

    // Whether this token is active (revocation sets this to false)
    isActive: { type: Boolean, default: true, index: true },

    // Track last usage
    lastUsedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ApiClient', ApiClientSchema);
