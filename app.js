/**
 * Alumni Influencers Platform
 * ============================================================
 * Main application entry point.
 *
 * Architecture:
 *  - Express.js web framework
 *  - MongoDB via Mongoose for data persistence
 *  - EJS for server-rendered HTML views (alumni-facing web pages)
 *  - JSON REST API for AR/external clients (/api/v1/*)
 *  - express-session for alumni authentication
 *  - Bearer tokens (ApiClient model) for API client authentication
 *
 * Security layers (in order of application):
 *  1. Helmet.js — HTTP security headers
 *  2. CORS — restricts cross-origin access
 *  3. Rate limiting — prevents brute force / abuse
 *  4. express-mongo-sanitize — prevents NoSQL injection
 *  5. xss-clean — sanitises output against XSS
 *  6. csurf — CSRF token protection on all state-changing web routes
 *  7. express-validator — input validation (in middleware/validate.js)
 *  8. bcryptjs — password hashing (in User model)
 *  9. Secure session config (httpOnly, secure in production, sameSite)
 * 10. Cryptographically random tokens for verification/reset (tokenService)
 */

require('dotenv').config(); // Must be first — loads .env into process.env

const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const csrf = require('csurf');
const morgan = require('morgan');
const swaggerUi = require('swagger-ui-express');

const connectDB = require('./config/db');
const swaggerSpec = require('./swagger/swagger');
const { setLocals } = require('./middleware/auth');
const { initCronJobs } = require('./services/cronService');

// ─── Routes ───────────────────────────────────────────────────────────────────
const authRoutes    = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const biddingRoutes = require('./routes/bidding');
const adminRoutes   = require('./routes/admin');
const apiRoutes     = require('./routes/api');

const app = express();

// ─── Connect to MongoDB ───────────────────────────────────────────────────────
connectDB().then(() => {
  // Only start cron jobs after DB is ready
  initCronJobs();
});

// ─── View Engine ──────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Security Middleware ──────────────────────────────────────────────────────

// Helmet sets secure HTTP headers (X-Frame-Options, CSP, HSTS, etc.)
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc:   ["'self'", "'unsafe-inline'"], // Allow inline styles for simplicity
        scriptSrc:  ["'self'"],
        imgSrc:     ["'self'", 'data:'],
      },
    },
  })
);

// CORS — API routes allow any origin (client-agnostic), web routes restricted
app.use('/api', cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));

// Global rate limiter (generous — tighter limits applied per-route)
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

// Strict rate limiter for auth routes (prevents brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20, // Only 20 login/register attempts per 15 mins
  message: 'Too many authentication attempts. Please wait before trying again.',
  skipSuccessfulRequests: true,
});

// ─── Body Parsers ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10kb' }));         // Limit JSON body size
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Sanitise all request data against NoSQL injection (strips $ and . from keys)
app.use(mongoSanitize());

// Sanitise against XSS (clean HTML from user input)
app.use(xss());

// ─── Logging ──────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev')); // HTTP request logging
}

// ─── Static Files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── Session ──────────────────────────────────────────────────────────────────
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      ttl: 24 * 60 * 60, // Session TTL: 24 hours
      autoRemove: 'native',
    }),
    cookie: {
      httpOnly: true,                                      // Prevent JS access to cookie
      secure: process.env.NODE_ENV === 'production',       // HTTPS only in production
      sameSite: 'lax',                                     // CSRF protection
      maxAge: 24 * 60 * 60 * 1000,                        // 24 hours
    },
    name: 'alumni.sid', // Custom session cookie name (don't expose 'connect.sid')
  })
);

// ─── CSRF Protection ──────────────────────────────────────────────────────────
// Applied AFTER session middleware. Excludes API routes (they use Bearer tokens).
// Configure CSRF to check body, query string, AND headers
// Query string is needed for multipart/form-data (file upload forms) because
// the body parser (multer) runs AFTER csrf middleware, so _csrf can't be in body
const csrfProtection = csrf({
  cookie: false,
  value: (req) =>
    req.body._csrf ||
    req.query._csrf ||
    req.headers['x-csrf-token'] ||
    req.headers['csrf-token'],
});

// Middleware to add csrfToken to all web views
const addCsrfToken = (req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  next();
};

// ─── Global View Locals ───────────────────────────────────────────────────────
// Sets res.locals.user from session, and flash messages
app.use(setLocals);

// ─── Swagger API Docs ────────────────────────────────────────────────────────
// No auth required to view docs
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Alumni Influencers API',
  swaggerOptions: { persistAuthorization: true },
}));

// ─── API Routes (Bearer token auth, no CSRF needed) ──────────────────────────
app.use('/api/v1', apiRoutes);

// ─── Web Routes (session auth + CSRF protection) ─────────────────────────────
app.use('/auth',    authLimiter, csrfProtection, addCsrfToken, authRoutes);
app.use('/profile', csrfProtection, addCsrfToken, profileRoutes);
app.use('/bidding', csrfProtection, addCsrfToken, biddingRoutes);
app.use('/admin',   csrfProtection, addCsrfToken, adminRoutes);

// ─── Home Route ───────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  if (req.session.userId) return res.redirect('/profile');
  res.redirect('/auth/login');
});

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'Endpoint not found.' });
  }
  res.status(404).render('error', { title: '404 Not Found', message: 'The page you are looking for does not exist.' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  // Handle CSRF token errors
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).render('error', {
      title: 'Security Error',
      message: 'Form submission failed security check. Please try again.',
    });
  }
  console.error('[Error]', err.stack);
  if (req.path.startsWith('/api/')) {
    return res.status(err.status || 500).json({ success: false, error: err.message || 'Internal server error.' });
  }
  res.status(err.status || 500).render('error', {
    title: 'Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong.',
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║   Alumni Influencers Platform          ║
  ║   Running on: http://localhost:${PORT}   ║
  ║   API Docs:   http://localhost:${PORT}/api-docs ║
  ╚════════════════════════════════════════╝
  `);
});

module.exports = app;
