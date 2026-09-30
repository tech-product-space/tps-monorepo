const express = require("express");
const router = express.Router();
const controller = require("../controllers/onboarding/profileSubmissions.controller");
const { authenticate, requireRole } = require("../middlewares/auth.middleware");
const { ROLES } = require("../config/constants/roles");

/**
 * The Student Profiles list — every onboarding submission in one place.
 *
 * Its own router rather than three more paths on profile.routes.js, which
 * already declares `GET /:id`: a `/submissions` path there would only work
 * because it happens to sit above that line, and reordering the file would
 * silently turn it into a profile-id lookup that 404s.
 *
 * Same pair as the per-student details tab — see canViewOnboardingDetails in
 * config/constants/roles.js. No WRITE_ALLOWLIST entry is needed: both handlers
 * are GETs and readOnly.middleware.js passes every safe method, so the
 * read-only Program Manager reaches them unimpeded.
 */
const ONBOARDING_DETAIL_ROLES = [ROLES.SUPERADMIN, ROLES.PROGRAM_MANAGER];

router.use(authenticate);
router.use(requireRole(ONBOARDING_DETAIL_ROLES));

// Keep `/export` and `/filters` above any future `/:id` — see the note above.
router.get("/", controller.list);
router.get("/export", controller.exportCsv);
router.get("/filters", controller.filters);

module.exports = router;
