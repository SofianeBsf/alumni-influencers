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

router.use(requireLogin);

// Main profile
router.get('/',        profileController.getProfile);
router.get('/create',  profileController.getCreateProfile);
router.post('/create', upload.single('profileImage'), validateProfile, profileController.postCreateProfile);
router.get('/edit',    profileController.getEditProfile);
router.post('/edit',   upload.single('profileImage'), validateProfile, profileController.postEditProfile);

// Degrees
router.post('/degrees/add',            validateCredential, profileController.addDegree);
router.post('/degrees/:itemId/edit',   validateCredential, profileController.editDegree);
router.delete('/degrees/:itemId',      profileController.deleteDegree);

// Certifications
router.post('/certifications/add',            validateCredential, profileController.addCertification);
router.post('/certifications/:itemId/edit',   validateCredential, profileController.editCertification);
router.delete('/certifications/:itemId',      profileController.deleteCertification);

// Licences
router.post('/licences/add',            validateCredential, profileController.addLicence);
router.post('/licences/:itemId/edit',   validateCredential, profileController.editLicence);
router.delete('/licences/:itemId',      profileController.deleteLicence);

// Short Courses
router.post('/courses/add',            validateCredential, profileController.addCourse);
router.post('/courses/:itemId/edit',   validateCredential, profileController.editCourse);
router.delete('/courses/:itemId',      profileController.deleteCourse);

// Employment
router.post('/employment/add',            validateEmployment, profileController.addEmployment);
router.post('/employment/:itemId/edit',   profileController.editEmployment);
router.delete('/employment/:itemId',      profileController.deleteEmployment);

module.exports = router;
