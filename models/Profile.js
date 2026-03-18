/**
 * Profile Model
 * Stores the alumni's public-facing professional profile.
 * Separated from User model (3NF) - one profile per user.
 *
 * Sub-documents for degrees, certifications, licences, courses,
 * and employment are kept as embedded arrays. This is appropriate
 * in MongoDB as they are always fetched together with the profile
 * and don't need to be queried independently.
 */

const mongoose = require('mongoose');

// --- Reusable sub-schema for items with a URL and completion date ---
const credentialSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  institution: { type: String, required: true, trim: true },
  url: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: (v) => /^https?:\/\/.+/.test(v),
      message: 'URL must start with http:// or https://',
    },
  },
  completionDate: { type: Date, required: true },
}, { _id: true });

// --- Employment history sub-schema ---
const employmentSchema = new mongoose.Schema({
  company: { type: String, required: true, trim: true },
  role: { type: String, required: true, trim: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date }, // null = current position
  isCurrent: { type: Boolean, default: false },
}, { _id: true });

const ProfileSchema = new mongoose.Schema(
  {
    // Reference to the owning user (1-to-1 relationship)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },

    // --- Personal Information ---
    firstName: { type: String, required: true, trim: true },
    lastName:  { type: String, required: true, trim: true },
    bio:       { type: String, trim: true, maxlength: 2000 },
    linkedinUrl: {
      type: String,
      trim: true,
      validate: {
        validator: (v) => !v || /^https?:\/\/(www\.)?linkedin\.com\//.test(v),
        message: 'Must be a valid LinkedIn URL',
      },
    },

    // --- Profile Image ---
    // Stored as a relative path under /public/uploads/
    profileImage: { type: String, default: null },

    // --- Credentials (all support multiple entries) ---
    degrees:        [credentialSchema],
    certifications: [credentialSchema],
    licences:       [credentialSchema],
    courses:        [credentialSchema],

    // --- Employment History ---
    employment: [employmentSchema],
  },
  { timestamps: true }
);

// Virtual: full name
ProfileSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

module.exports = mongoose.model('Profile', ProfileSchema);
