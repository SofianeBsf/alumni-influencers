/**
 * User Model
 * Stores authentication data separately from profile data (3NF).
 * Sensitive fields: password (bcrypt hash), verification/reset tokens.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      index: true, // Indexed for fast lookup during login
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: 8,
      select: false, // Never returned in queries by default
    },
    role: {
      type: String,
      enum: ['alumni', 'admin'],
      default: 'alumni',
    },

    // --- Email Verification ---
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String, select: false },
    verificationTokenExpiry: { type: Date, select: false },

    // --- Password Reset ---
    resetToken: { type: String, select: false },
    resetTokenExpiry: { type: Date, select: false },
    resetTokenUsed: { type: Boolean, default: false, select: false },

    // --- Alumni Event Participation (grants 4th monthly bid slot) ---
    alumniEventAttendance: [
      {
        eventName: String,
        eventDate: Date,
        monthYear: String, // "YYYY-MM" format for fast monthly lookup
      },
    ],
  },
  { timestamps: true }
);

/**
 * Pre-save hook: hash password with bcrypt before saving.
 * Only runs when password field has been modified.
 */
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12); // 12 rounds - secure but not too slow
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

/**
 * Instance method: compare plain-text password to stored hash.
 * Used during login.
 */
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Instance method: check if a token has expired.
 */
UserSchema.methods.isTokenExpired = function (expiryDate) {
  return !expiryDate || Date.now() > expiryDate.getTime();
};

module.exports = mongoose.model('User', UserSchema);
