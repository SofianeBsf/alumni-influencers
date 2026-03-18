/**
 * Profile Routes
 * All routes require a logged-in session.
 */

const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');
const { requireLogin } = require('../middleware/auth');
const { validateProfile, validateCredential, validateEmployment } = require('../middleware/validate');
const upload = require('../middleware/upload');

// Apply login guard to all profile routes
router.use(requireLogin);

// Main profile
router.get('/',       profileController.getProfile);
router.get('/create', profileController.getCreateProfile);
router.post('/create', upload.single('profileImage'), validateProfile, profileController.postCreateProfile);
router.get('/edit',   profileController.getEditProfile);
router.post('/edit',  upload.single('profileImage'), validateProfile, profileController.postEditProfile);

// Degrees
router.post('/degrees/add',          validateCredential, profileController.addDegree);
router.delete('/degrees/:itemId',    profileController.deleteDegree);

// Certifications
router.post('/certifications/add',       validateCredential, profileController.addCertification);
router.delete('/certifications/:itemId', profileController.deleteCertification);

// Licences
router.post('/licences/add',       validateCredential, profileController.addLicence);
router.delete('/licences/:itemId', profileController.deleteLicence);

// Short Courses
router.post('/courses/add',       validateCredential, profileController.addCourse);
router.delete('/courses/:itemId', profileController.deleteCourse);

// Employment
router.post('/employment/add',       validateEmployment, profileController.addEmployment);
router.delete('/employment/:itemId', profileController.deleteEmployment);

module.exports = router;
