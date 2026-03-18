/**
 * Auth Routes
 * Maps HTTP requests to auth controller functions.
 * Validation middleware runs before controllers.
 */

const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { validateRegister, validateLogin, validatePasswordReset } = require('../middleware/validate');

router.get('/register', authController.getRegister);
router.post('/register', validateRegister, authController.postRegister);

router.get('/verify-email', authController.verifyEmail);

router.get('/login', authController.getLogin);
router.post('/login', validateLogin, authController.postLogin);

router.post('/logout', authController.logout);

router.get('/forgot-password', authController.getForgotPassword);
router.post('/forgot-password', authController.postForgotPassword);

router.get('/reset-password', authController.getResetPassword);
router.post('/reset-password', validatePasswordReset, authController.postResetPassword);

module.exports = router;
