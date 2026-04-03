/**
 * Validation Middleware
 * Centralised input validation rules using express-validator.
 * All user input is validated and sanitised before reaching controllers.
 * Prevents XSS, injection, and malformed data.
 */

const { body, param, validationResult } = require('express-validator');

/**
 * Handle validation errors — return a 422 with field-level error messages.
 * Use this at the end of every validation chain.
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // For API routes return JSON; for web routes re-render with errors
    if (req.path.startsWith('/api/')) {
      return res.status(422).json({ success: false, errors: errors.array() });
    }
    // For web form routes, store errors in session and redirect back
    req.session.validationErrors = errors.array();
    req.session.formData = req.body;
    return res.redirect('back');
  }
  next();
};

// --- Auth Validators ---

const validateRegister = [
  body('email')
    .trim()
    .isEmail().withMessage('Please enter a valid email address')
    .normalizeEmail()
    .custom((value) => {
      const domain = process.env.UNIVERSITY_DOMAIN || 'westminster.ac.uk';
      if (!value.endsWith(`@${domain}`)) {
        throw new Error(`Registration is restricted to @${domain} email addresses`);
      }
      return true;
    }),
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/[0-9]/).withMessage('Password must contain at least one number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Password must contain at least one special character'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) throw new Error('Passwords do not match');
      return true;
    }),
  handleValidationErrors,
];

const validateLogin = [
  body('email').trim().isEmail().withMessage('Invalid email').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
  handleValidationErrors,
];

const validatePasswordReset = [
  body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Must contain uppercase letter')
    .matches(/[a-z]/).withMessage('Must contain lowercase letter')
    .matches(/[0-9]/).withMessage('Must contain a number')
    .matches(/[!@#$%^&*(),.?":{}|<>]/).withMessage('Must contain a special character'),
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) throw new Error('Passwords do not match');
      return true;
    }),
  handleValidationErrors,
];

// --- Profile Validators ---

const validateProfile = [
  body('firstName').trim().notEmpty().withMessage('First name is required').escape(),
  body('lastName').trim().notEmpty().withMessage('Last name is required').escape(),
  body('bio').optional().trim().isLength({ max: 2000 }).withMessage('Bio must be under 2000 characters').escape(),
  body('linkedinUrl')
    .optional({ checkFalsy: true })
    .trim()
    .isURL().withMessage('LinkedIn URL must be a valid URL')
    .matches(/linkedin\.com/).withMessage('Must be a LinkedIn URL'),
  handleValidationErrors,
];

const validateCredential = [
  body('name').trim().notEmpty().withMessage('Name is required').escape(),
  body('institution').trim().notEmpty().withMessage('Institution/Issuer is required').escape(),
  body('url').trim().isURL().withMessage('Must be a valid URL'),
  body('completionDate').isISO8601().withMessage('Must be a valid date').toDate(),
  handleValidationErrors,
];

const validateEmployment = [
  body('company').trim().notEmpty().withMessage('Company is required').escape(),
  body('role').trim().notEmpty().withMessage('Role is required').escape(),
  body('startDate').isISO8601().withMessage('Start date must be valid').toDate(),
  body('endDate')
    .optional({ checkFalsy: true })
    .isISO8601().withMessage('End date must be valid')
    .toDate()
    .custom((value, { req }) => {
      if (value && req.body.startDate && value < new Date(req.body.startDate)) {
        throw new Error('End date must be after start date');
      }
      return true;
    }),
  handleValidationErrors,
];

// --- Bid Validators ---

const validateBid = [
  body('amount')
    .isFloat({ min: 1 }).withMessage('Bid amount must be at least £1')
    .toFloat(),
  handleValidationErrors,
];

// --- API Client Validators ---

const validateApiClient = [
  body('name').trim().notEmpty().withMessage('Client name is required').escape(),
  body('description').optional().trim().escape(),
  // Scope validation is handled in the controller — express-validator v7
  // processes array fields (checkboxes) per-element which breaks custom array logic here
  handleValidationErrors,
];

module.exports = {
  validateRegister,
  validateLogin,
  validatePasswordReset,
  validateProfile,
  validateCredential,
  validateEmployment,
  validateBid,
  validateApiClient,
  handleValidationErrors,
};
