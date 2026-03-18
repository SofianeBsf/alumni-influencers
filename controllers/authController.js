/**
 * Auth Controller
 * Handles all authentication logic:
 * - Register, Verify Email, Login, Logout, Forgot Password, Reset Password
 *
 * Security design:
 * - Tokens are SHA-256 hashed before storing in DB (only hash stored, plain sent in email)
 * - Tokens are single-use (cleared after use)
 * - Password reset tokens expire in 1 hour
 * - Verification tokens expire in 24 hours
 * - Sessions are regenerated after login to prevent session fixation attacks
 */

const User = require('../models/User');
const { generateTokenWithHash, hashToken, getExpiryDate } = require('../services/tokenService');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');

// ─── REGISTER ────────────────────────────────────────────────────────────────

/**
 * GET /auth/register
 */
const getRegister = (req, res) => {
  res.render('auth/register', {
    title: 'Register',
    errors: req.session.validationErrors || [],
    formData: req.session.formData || {},
  });
  delete req.session.validationErrors;
  delete req.session.formData;
};

/**
 * POST /auth/register
 * Creates a new alumni account and sends a verification email.
 */
const postRegister = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Check for existing account (prevents duplicate accounts)
    const existing = await User.findOne({ email });
    if (existing) {
      req.session.error = 'An account with this email already exists.';
      return res.redirect('/auth/register');
    }

    // Generate secure verification token
    const { token, hash } = generateTokenWithHash(32);
    const expiry = getExpiryDate(Number(process.env.VERIFICATION_TOKEN_EXPIRY_HOURS) || 24);

    // Create user (password is hashed automatically by pre-save hook)
    await User.create({
      email,
      password,
      verificationToken: hash,       // Store hash, not plain token
      verificationTokenExpiry: expiry,
    });

    // Send verification email with the plain token in the URL
    await sendVerificationEmail(email, token);

    req.session.success = 'Registration successful! Please check your email to verify your account.';
    res.redirect('/auth/login');
  } catch (err) {
    console.error('[Auth] Register error:', err);
    req.session.error = 'Registration failed. Please try again.';
    res.redirect('/auth/register');
  }
};

// ─── VERIFY EMAIL ─────────────────────────────────────────────────────────────

/**
 * GET /auth/verify-email?token=xxx
 * Verifies the user's email using the token sent in the email.
 */
const verifyEmail = async (req, res) => {
  const { token } = req.query;

  if (!token) {
    req.session.error = 'Invalid verification link.';
    return res.redirect('/auth/login');
  }

  try {
    // Hash the incoming token to compare with stored hash
    const tokenHash = hashToken(token);

    const user = await User.findOne({ verificationToken: tokenHash }).select(
      '+verificationToken +verificationTokenExpiry'
    );

    if (!user) {
      req.session.error = 'Invalid or already used verification link.';
      return res.redirect('/auth/login');
    }

    if (user.isTokenExpired(user.verificationTokenExpiry)) {
      req.session.error = 'Verification link has expired. Please register again.';
      return res.redirect('/auth/login');
    }

    // Activate account and clear token (single-use)
    user.isVerified = true;
    user.verificationToken = undefined;
    user.verificationTokenExpiry = undefined;
    await user.save();

    req.session.success = 'Email verified successfully! You can now log in.';
    res.redirect('/auth/login');
  } catch (err) {
    console.error('[Auth] Verify error:', err);
    req.session.error = 'Verification failed. Please try again.';
    res.redirect('/auth/login');
  }
};

// ─── LOGIN ────────────────────────────────────────────────────────────────────

/**
 * GET /auth/login
 */
const getLogin = (req, res) => {
  if (req.session.userId) return res.redirect('/profile');
  res.render('auth/login', {
    title: 'Login',
    errors: req.session.validationErrors || [],
    formData: req.session.formData || {},
  });
  delete req.session.validationErrors;
  delete req.session.formData;
};

/**
 * POST /auth/login
 * Authenticates alumni and creates a session.
 */
const postLogin = async (req, res) => {
  const { email, password } = req.body;

  try {
    // Fetch user with password field (excluded by default for security)
    const user = await User.findOne({ email }).select('+password');

    // Use identical error message for wrong email OR wrong password
    // (prevents user enumeration attacks)
    const authError = 'Invalid email or password.';

    if (!user) {
      req.session.error = authError;
      return res.redirect('/auth/login');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      req.session.error = authError;
      return res.redirect('/auth/login');
    }

    // Prevent unverified users from logging in
    if (!user.isVerified) {
      req.session.error = 'Please verify your email before logging in. Check your inbox.';
      return res.redirect('/auth/login');
    }

    // Regenerate session to prevent session fixation attacks
    req.session.regenerate((err) => {
      if (err) {
        console.error('[Auth] Session regeneration error:', err);
        req.session.error = 'Login failed. Please try again.';
        return res.redirect('/auth/login');
      }

      // Store user info in session
      req.session.userId = user._id.toString();
      req.session.userEmail = user.email;
      req.session.userRole = user.role;

      // Redirect to originally requested page or profile
      const returnTo = req.session.returnTo || '/profile';
      delete req.session.returnTo;
      res.redirect(returnTo);
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    req.session.error = 'Login failed. Please try again.';
    res.redirect('/auth/login');
  }
};

// ─── LOGOUT ───────────────────────────────────────────────────────────────────

/**
 * POST /auth/logout
 * Destroys the session and clears the session cookie.
 */
const logout = (req, res) => {
  req.session.destroy((err) => {
    if (err) console.error('[Auth] Logout error:', err);
    res.clearCookie('connect.sid');
    res.redirect('/auth/login');
  });
};

// ─── FORGOT PASSWORD ──────────────────────────────────────────────────────────

/**
 * GET /auth/forgot-password
 */
const getForgotPassword = (req, res) => {
  res.render('auth/forgot-password', { title: 'Forgot Password' });
};

/**
 * POST /auth/forgot-password
 * Sends a password reset email if the email exists.
 * Always shows success message to prevent email enumeration.
 */
const postForgotPassword = async (req, res) => {
  const { email } = req.body;
  const successMsg = 'If an account with that email exists, a reset link has been sent.';

  try {
    const user = await User.findOne({ email });

    // Always show success — don't reveal whether email exists
    if (!user || !user.isVerified) {
      req.session.success = successMsg;
      return res.redirect('/auth/forgot-password');
    }

    const { token, hash } = generateTokenWithHash(32);
    const expiry = getExpiryDate(Number(process.env.RESET_TOKEN_EXPIRY_HOURS) || 1);

    user.resetToken = hash;
    user.resetTokenExpiry = expiry;
    user.resetTokenUsed = false;
    await user.save();

    await sendPasswordResetEmail(email, token);

    req.session.success = successMsg;
    res.redirect('/auth/forgot-password');
  } catch (err) {
    console.error('[Auth] Forgot password error:', err);
    req.session.success = successMsg; // Still show success to avoid leaking info
    res.redirect('/auth/forgot-password');
  }
};

// ─── RESET PASSWORD ───────────────────────────────────────────────────────────

/**
 * GET /auth/reset-password?token=xxx
 */
const getResetPassword = async (req, res) => {
  const { token } = req.query;
  if (!token) return res.redirect('/auth/forgot-password');

  const tokenHash = hashToken(token);
  const user = await User.findOne({ resetToken: tokenHash }).select(
    '+resetToken +resetTokenExpiry +resetTokenUsed'
  );

  if (!user || user.isTokenExpired(user.resetTokenExpiry) || user.resetTokenUsed) {
    req.session.error = 'This reset link is invalid or has expired. Please request a new one.';
    return res.redirect('/auth/forgot-password');
  }

  res.render('auth/reset-password', { title: 'Reset Password', token });
};

/**
 * POST /auth/reset-password
 * Updates the user's password and invalidates the token.
 */
const postResetPassword = async (req, res) => {
  const { token, password } = req.body;

  try {
    const tokenHash = hashToken(token);
    const user = await User.findOne({ resetToken: tokenHash }).select(
      '+password +resetToken +resetTokenExpiry +resetTokenUsed'
    );

    if (!user || user.isTokenExpired(user.resetTokenExpiry) || user.resetTokenUsed) {
      req.session.error = 'Reset link is invalid or expired. Please request a new one.';
      return res.redirect('/auth/forgot-password');
    }

    // Update password (will be hashed by pre-save hook)
    user.password = password;
    // Mark token as used (single-use enforcement)
    user.resetToken = undefined;
    user.resetTokenExpiry = undefined;
    user.resetTokenUsed = true;
    await user.save();

    req.session.success = 'Password reset successfully. Please log in with your new password.';
    res.redirect('/auth/login');
  } catch (err) {
    console.error('[Auth] Reset password error:', err);
    req.session.error = 'Password reset failed. Please try again.';
    res.redirect('/auth/forgot-password');
  }
};

module.exports = {
  getRegister, postRegister,
  verifyEmail,
  getLogin, postLogin,
  logout,
  getForgotPassword, postForgotPassword,
  getResetPassword, postResetPassword,
};
