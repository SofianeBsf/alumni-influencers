/**
 * Authentication Middleware
 * Protects routes that require a logged-in alumni session.
 */

/**
 * requireLogin - Redirects to login page if user is not authenticated.
 * Attaches the user session to res.locals for use in views.
 */
const requireLogin = (req, res, next) => {
  if (!req.session || !req.session.userId) {
    req.session.returnTo = req.originalUrl; // Save intended destination
    return res.redirect('/auth/login');
  }
  // Make user info available in all EJS templates
  res.locals.user = {
    id: req.session.userId,
    email: req.session.userEmail,
    role: req.session.userRole,
  };
  next();
};

/**
 * requireAdmin - Only allows admin users through.
 */
const requireAdmin = (req, res, next) => {
  if (!req.session || !req.session.userId || req.session.userRole !== 'admin') {
    return res.status(403).render('error', {
      title: 'Access Denied',
      message: 'You do not have permission to access this page.',
    });
  }
  res.locals.user = {
    id: req.session.userId,
    email: req.session.userEmail,
    role: req.session.userRole,
  };
  next();
};

/**
 * setLocals - Sets session user on res.locals for ALL routes (including public).
 * Allows views to conditionally show login/logout buttons.
 */
const setLocals = (req, res, next) => {
  res.locals.user = req.session && req.session.userId
    ? { id: req.session.userId, email: req.session.userEmail, role: req.session.userRole }
    : null;
  res.locals.success = req.session.success || null;
  res.locals.error = req.session.error || null;
  delete req.session.success;
  delete req.session.error;
  next();
};

module.exports = { requireLogin, requireAdmin, setLocals };
