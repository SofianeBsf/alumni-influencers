/**
 * Email Service
 * Handles all outgoing emails using Nodemailer with Gmail.
 * Sends: verification emails, password reset emails, bid notifications.
 *
 * Gmail setup: Enable 2FA → Google Account > Security > App Passwords → generate one.
 * Set EMAIL_USER and EMAIL_PASS in your .env file.
 */

const nodemailer = require('nodemailer');

// Create reusable transporter using Gmail SMTP
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
};

/**
 * Send email verification link to a newly registered alumni.
 * @param {string} to - Recipient email
 * @param {string} token - Plain verification token (sent in URL)
 */
const sendVerificationEmail = async (to, token) => {
  const transporter = createTransporter();
  const verifyUrl = `${process.env.APP_URL}/auth/verify-email?token=${token}`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: 'Verify your Alumni Influencers account',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Welcome to Alumni Influencers!</h2>
        <p>Please verify your email address to activate your account.</p>
        <p>This link expires in <strong>${process.env.VERIFICATION_TOKEN_EXPIRY_HOURS || 24} hours</strong>.</p>
        <a href="${verifyUrl}"
           style="display:inline-block;padding:12px 24px;background:#3498db;color:#fff;text-decoration:none;border-radius:4px;margin:16px 0;">
          Verify Email Address
        </a>
        <p style="color:#888;font-size:12px;">If you didn't create this account, you can safely ignore this email.</p>
        <p style="color:#888;font-size:12px;">Link: ${verifyUrl}</p>
      </div>
    `,
  });
};

/**
 * Send password reset link.
 * @param {string} to - Recipient email
 * @param {string} token - Plain reset token
 */
const sendPasswordResetEmail = async (to, token) => {
  const transporter = createTransporter();
  const resetUrl = `${process.env.APP_URL}/auth/reset-password?token=${token}`;

  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: 'Reset your Alumni Influencers password',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Password Reset Request</h2>
        <p>We received a request to reset your password. Click the button below to proceed.</p>
        <p>This link expires in <strong>${process.env.RESET_TOKEN_EXPIRY_HOURS || 1} hour(s)</strong> and can only be used once.</p>
        <a href="${resetUrl}"
           style="display:inline-block;padding:12px 24px;background:#e74c3c;color:#fff;text-decoration:none;border-radius:4px;margin:16px 0;">
          Reset Password
        </a>
        <p style="color:#888;font-size:12px;">If you didn't request this, please ignore this email. Your password won't change.</p>
        <p style="color:#888;font-size:12px;">Link: ${resetUrl}</p>
      </div>
    `,
  });
};

/**
 * Notify an alumni they have won the daily bid.
 * @param {string} to - Winner's email
 * @param {string} firstName - Winner's first name
 * @param {string} date - Featured date string
 */
const sendWinNotification = async (to, firstName, date) => {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: '🏆 You won today\'s Alumni of the Day bid!',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #27ae60;">Congratulations, ${firstName}!</h2>
        <p>Your bid was the highest for <strong>${date}</strong>.</p>
        <p>Your profile will be featured as <strong>Alumni of the Day</strong> for the entire day, visible to all students.</p>
        <p>Make sure your profile is up to date to make the best impression!</p>
        <a href="${process.env.APP_URL}/profile/edit"
           style="display:inline-block;padding:12px 24px;background:#27ae60;color:#fff;text-decoration:none;border-radius:4px;margin:16px 0;">
          Update My Profile
        </a>
      </div>
    `,
  });
};

/**
 * Notify an alumni they lost today's bid.
 * @param {string} to
 * @param {string} firstName
 * @param {string} date
 */
const sendLossNotification = async (to, firstName, date) => {
  const transporter = createTransporter();
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to,
    subject: 'Alumni Influencers - Bid result for ' + date,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #e67e22;">Better luck next time, ${firstName}!</h2>
        <p>Unfortunately your bid was not the highest for <strong>${date}</strong>.</p>
        <p>You can place a new bid for tomorrow's slot. Remember, you can only increase your bids, not decrease them.</p>
        <a href="${process.env.APP_URL}/bidding"
           style="display:inline-block;padding:12px 24px;background:#3498db;color:#fff;text-decoration:none;border-radius:4px;margin:16px 0;">
          Place a New Bid
        </a>
      </div>
    `,
  });
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWinNotification,
  sendLossNotification,
};
