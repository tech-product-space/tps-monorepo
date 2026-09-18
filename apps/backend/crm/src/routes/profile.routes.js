const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profile.controller');
const onboardingDetailsController = require('../controllers/onboarding/profileDetails.controller');
const { authenticate, requireRole } = require('../middlewares/auth.middleware');
const { ROLES } = require('../config/constants/roles');

router.use(authenticate);

// Self-reported onboarding answers. Mirrors canViewOnboardingDetails in
// config/constants/roles.js — personal free-text about a student's life, shown
// to the people who run the programme and nobody else.
//
// No WRITE_ALLOWLIST entry is needed for the Program Manager here: this is a
// GET, and readOnly.middleware.js lets every safe method through.
const ONBOARDING_DETAIL_ROLES = [ROLES.SUPERADMIN, ROLES.PROGRAM_MANAGER];

router.get('/search', profileController.searchProfiles);
router.get('/:id', profileController.getFullProfile);
router.get('/:id/timeline', profileController.getProfileTimeline);
router.get('/:id/leads', profileController.getProfileLeads);
router.get(
  '/:id/details',
  requireRole(ONBOARDING_DETAIL_ROLES),
  onboardingDetailsController.getProfileDetails,
);
router.patch('/:id/contact', profileController.updateProfileContact);

module.exports = router;
