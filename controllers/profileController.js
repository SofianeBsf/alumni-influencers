/**
 * Profile Controller
 * Handles alumni profile creation, viewing, and editing.
 * Each sub-section (degrees, certs, licences, courses, employment)
 * supports add/edit/delete operations.
 */

const Profile = require('../models/Profile');
const path = require('path');
const fs = require('fs');

// ─── PROFILE COMPLETION SCORE ─────────────────────────────────────────────────

/**
 * Calculate profile completion percentage (0–100).
 * Each optional section counts equally.
 */
const calcCompletionScore = (profile) => {
  const checks = [
    !!profile.bio,
    !!profile.linkedinUrl,
    !!profile.profileImage,
    profile.degrees.length > 0,
    profile.certifications.length > 0,
    profile.licences.length > 0,
    profile.courses.length > 0,
    profile.employment.length > 0,
  ];
  const filled = checks.filter(Boolean).length;
  return Math.round((filled / checks.length) * 100);
};

// ─── VIEW / CREATE PROFILE ────────────────────────────────────────────────────

const getProfile = async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.session.userId });
    if (!profile) return res.redirect('/profile/create');
    const completionScore = calcCompletionScore(profile);
    res.render('profile/view', { title: 'My Profile', profile, completionScore });
  } catch (err) {
    console.error('[Profile] getProfile error:', err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load profile.' });
  }
};

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

const postCreateProfile = async (req, res) => {
  try {
    const { firstName, lastName, bio, linkedinUrl } = req.body;
    const profileImage = req.file ? `/uploads/${req.file.filename}` : null;

    await Profile.create({ user: req.session.userId, firstName, lastName, bio, linkedinUrl, profileImage });

    req.session.success = 'Profile created! Now add your qualifications and experience.';
    res.redirect('/profile/edit');
  } catch (err) {
    console.error('[Profile] Create error:', err);
    req.session.error = 'Failed to create profile.';
    res.redirect('/profile/create');
  }
};

// ─── EDIT PERSONAL INFO ───────────────────────────────────────────────────────

const getEditProfile = async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.session.userId });
    if (!profile) return res.redirect('/profile/create');
    const completionScore = calcCompletionScore(profile);
    res.render('profile/edit', {
      title: 'Edit Profile',
      profile,
      completionScore,
      errors: req.session.validationErrors || [],
    });
    delete req.session.validationErrors;
  } catch (err) {
    console.error('[Profile] getEdit error:', err);
    res.status(500).render('error', { title: 'Error', message: 'Could not load profile.' });
  }
};

const postEditProfile = async (req, res) => {
  try {
    const { firstName, lastName, bio, linkedinUrl } = req.body;
    const profile = await Profile.findOne({ user: req.session.userId });
    if (!profile) return res.redirect('/profile/create');

    profile.firstName = firstName;
    profile.lastName = lastName;
    profile.bio = bio;
    profile.linkedinUrl = linkedinUrl;

    if (req.file) {
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

/** Add an item to a credential sub-array. */
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

/** Edit (update) a credential sub-document by ID. */
const editSubItem = (arrayField) => async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.session.userId });
    if (!profile) return res.redirect('/profile/create');

    const item = profile[arrayField].id(req.params.itemId);
    if (!item) {
      req.session.error = 'Entry not found.';
      return res.redirect('/profile/edit');
    }

    const { name, institution, url, completionDate } = req.body;
    item.name = name;
    item.institution = institution;
    item.url = url;
    item.completionDate = completionDate;
    await profile.save();

    req.session.success = 'Entry updated successfully.';
    res.redirect('/profile/edit');
  } catch (err) {
    console.error(`[Profile] edit ${arrayField} error:`, err);
    req.session.error = 'Failed to update entry.';
    res.redirect('/profile/edit');
  }
};

/** Delete a credential sub-document by ID. */
const deleteSubItem = (arrayField) => async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.session.userId });
    if (!profile) return res.status(404).json({ success: false });

    profile[arrayField].pull({ _id: req.params.itemId });
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

const editEmployment = async (req, res) => {
  try {
    const profile = await Profile.findOne({ user: req.session.userId });
    if (!profile) return res.redirect('/profile/create');

    const item = profile.employment.id(req.params.itemId);
    if (!item) {
      req.session.error = 'Employment entry not found.';
      return res.redirect('/profile/edit');
    }

    const { company, role, startDate, endDate, isCurrent } = req.body;
    item.company = company;
    item.role = role;
    item.startDate = startDate;
    item.isCurrent = !!isCurrent;
    item.endDate = isCurrent ? null : endDate;
    await profile.save();

    req.session.success = 'Employment entry updated.';
    res.redirect('/profile/edit');
  } catch (err) {
    console.error('[Profile] editEmployment error:', err);
    req.session.error = 'Failed to update employment.';
    res.redirect('/profile/edit');
  }
};

const deleteEmployment = deleteSubItem('employment');

module.exports = {
  getProfile,
  getCreateProfile, postCreateProfile,
  getEditProfile, postEditProfile,
  addDegree:           addSubItem('degrees'),
  editDegree:          editSubItem('degrees'),
  deleteDegree:        deleteSubItem('degrees'),
  addCertification:    addSubItem('certifications'),
  editCertification:   editSubItem('certifications'),
  deleteCertification: deleteSubItem('certifications'),
  addLicence:          addSubItem('licences'),
  editLicence:         editSubItem('licences'),
  deleteLicence:       deleteSubItem('licences'),
  addCourse:           addSubItem('courses'),
  editCourse:          editSubItem('courses'),
  deleteCourse:        deleteSubItem('courses'),
  addEmployment,
  editEmployment,
  deleteEmployment,
};
