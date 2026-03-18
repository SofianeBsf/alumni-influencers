/**
 * Profile Controller
 * Handles alumni profile creation, viewing, and editing.
 * Each sub-section (degrees, certs, licences, courses, employment)
 * supports add/edit/delete operations.
 */

const Profile = require('../models/Profile');
const path = require('path');
const fs = require('fs');

// ─── VIEW / CREATE PROFILE ────────────────────────────────────────────────────

/**
 * GET /profile
 * Shows the current user's profile, or redirects to create if none exists.
 */
const getProfile = async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.session.userId });
    if (!profile) {
      return res.redirect('/profile/create');
    }
    res.render('profile/view', { title: 'My Profile', profile });
  } catch (err) {
    console.error('[Profile] getProfile error:', err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load profile.' });
  }
};

/**
 * GET /profile/create
 */
const getCreateProfile = async (req, res) => {
  const existing = await Profile.findOne({ user: req.session.userId });
  if (existing) return res.redirect('/profile/edit');
  res.render('profile/create', {
    title: 'Create Profile',
    errors: req.session.validationErrors || [],
    formData: req.session.formData || {},
  });
  delete req.session.validationErrors;
  delete req.session.formData;
};

/**
 * POST /profile/create
 */
const postCreateProfile = async (req, res) => {
  try {
    const { firstName, lastName, bio, linkedinUrl } = req.body;
    const profileImage = req.file ? `/uploads/${req.file.filename}` : null;

    await Profile.create({
      user: req.session.userId,
      firstName,
      lastName,
      bio,
      linkedinUrl,
      profileImage,
    });

    req.session.success = 'Profile created! Now add your qualifications and experience.';
    res.redirect('/profile/edit');
  } catch (err) {
    console.error('[Profile] Create error:', err);
    req.session.error = 'Failed to create profile.';
    res.redirect('/profile/create');
  }
};

// ─── EDIT PROFILE ─────────────────────────────────────────────────────────────

/**
 * GET /profile/edit
 */
const getEditProfile = async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.session.userId });
    if (!profile) return res.redirect('/profile/create');
    res.render('profile/edit', {
      title: 'Edit Profile',
      profile,
      errors: req.session.validationErrors || [],
    });
    delete req.session.validationErrors;
  } catch (err) {
    console.error('[Profile] getEdit error:', err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load profile.' });
  }
};

/**
 * POST /profile/edit
 * Updates personal info section only.
 */
const postEditProfile = async (req, res) => {
  try {
    const { firstName, lastName, bio, linkedinUrl } = req.body;
    const profile = await Profile.findOne({ user: req.session.userId });
    if (!profile) return res.redirect('/profile/create');

    profile.firstName = firstName;
    profile.lastName = lastName;
    profile.bio = bio;
    profile.linkedinUrl = linkedinUrl;

    // Handle new image upload
    if (req.file) {
      // Delete old image file if it exists
      if (profile.profileImage) {
        const oldPath = path.join(__dirname, '../public', profile.profileImage);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      profile.profileImage = `/uploads/${req.file.filename}`;
    }

    await profile.save();
    req.session.success = 'Profile updated successfully.';
    res.redirect('/profile/edit');
  } catch (err) {
    console.error('[Profile] postEdit error:', err);
    req.session.error = 'Failed to update profile.';
    res.redirect('/profile/edit');
  }
};

// ─── GENERIC SUB-DOCUMENT HELPERS ─────────────────────────────────────────────

/**
 * Add an item to a profile sub-array (degrees, certifications, etc.)
 * @param {string} arrayField - The profile field name (e.g. 'degrees')
 */
const addSubItem = (arrayField) => async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.session.userId });
    if (!profile) return res.redirect('/profile/create');

    const { name, institution, url, completionDate } = req.body;
    profile[arrayField].push({ name, institution, url, completionDate });
    await profile.save();

    req.session.success = 'Entry added successfully.';
    res.redirect('/profile/edit');
  } catch (err) {
    console.error(`[Profile] add ${arrayField} error:`, err);
    req.session.error = 'Failed to add entry.';
    res.redirect('/profile/edit');
  }
};

/**
 * Delete an item from a profile sub-array by MongoDB sub-document ID.
 */
const deleteSubItem = (arrayField) => async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.session.userId });
    if (!profile) return res.status(404).json({ success: false });

    profile[arrayField].id(req.params.itemId).deleteOne();
    await profile.save();

    res.json({ success: true });
  } catch (err) {
    console.error(`[Profile] delete ${arrayField} error:`, err);
    res.status(500).json({ success: false, error: 'Failed to delete entry.' });
  }
};

// ─── EMPLOYMENT ───────────────────────────────────────────────────────────────

const addEmployment = async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.session.userId });
    if (!profile) return res.redirect('/profile/create');

    const { company, role, startDate, endDate, isCurrent } = req.body;
    profile.employment.push({
      company, role, startDate,
      endDate: isCurrent ? null : endDate,
      isCurrent: !!isCurrent,
    });
    await profile.save();

    req.session.success = 'Employment entry added.';
    res.redirect('/profile/edit');
  } catch (err) {
    console.error('[Profile] addEmployment error:', err);
    req.session.error = 'Failed to add employment.';
    res.redirect('/profile/edit');
  }
};

const deleteEmployment = deleteSubItem('employment');

module.exports = {
  getProfile,
  getCreateProfile, postCreateProfile,
  getEditProfile, postEditProfile,
  addDegree:        addSubItem('degrees'),
  deleteDegree:     deleteSubItem('degrees'),
  addCertification: addSubItem('certifications'),
  deleteCertification: deleteSubItem('certifications'),
  addLicence:       addSubItem('licences'),
  deleteLicence:    deleteSubItem('licences'),
  addCourse:        addSubItem('courses'),
  deleteCourse:     deleteSubItem('courses'),
  addEmployment,
  deleteEmployment,
};
