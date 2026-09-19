const express = require("express");
const router = express.Router();

const { authenticate, requireRole } = require("../middlewares/auth.middleware");
const cohortController = require("../controllers/cohort.controller");
const { ROLES } = require("../config/constants/roles");

// BASE URL -> /cohorts
router.use(authenticate);

// Listing is available to all authenticated users (powers the enroll dropdown).
router.get("/", cohortController.listCohorts);

// Cohorts are program configuration, so they sit with the Superadmin and the
// Program Manager who runs the cohorts day to day.
const COHORT_ADMINS = [ROLES.SUPERADMIN, ROLES.PROGRAM_MANAGER];

router.post("/", requireRole(COHORT_ADMINS), cohortController.createCohort);
router.put("/:id", requireRole(COHORT_ADMINS), cohortController.updateCohort);
router.delete("/:id", requireRole(COHORT_ADMINS), cohortController.deleteCohort);

module.exports = router;
