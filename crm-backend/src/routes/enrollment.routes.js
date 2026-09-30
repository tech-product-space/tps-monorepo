const express = require("express");
const router = express.Router();

const { authenticate, requireRole } = require("../middlewares/auth.middleware");
const { ROLES } = require("../config/constants/roles");
const { PROOF_MAX_FILES } = require("../config/constants/payment");
const uploadPaymentProof = require("../middlewares/uploadPaymentProof");
const leadCourseController = require("../controllers/payment/leadCourse.controller");

// BASE URL -> /enrollments
// Role scoping is applied inside the service via getScopedUserIds.
router.use(authenticate);

// Ending or restoring an enrollment is restricted to the same pair who approve
// money into one. Managers and Agents can SEE the dropped state (badge, date,
// reason) but cannot set or clear it.
//
// NOTE: ProgramManager is a globally read-only role. These paths must also be
// listed in WRITE_ALLOWLIST (middlewares/readOnly.middleware.js) or the PM half
// of this pair gets a blanket 403 before ever reaching requireRole.
const LIFECYCLE_ROLES = [ROLES.SUPERADMIN, ROLES.PROGRAM_MANAGER];

router.get("/", leadCourseController.listEnrollments);
router.get("/courses", leadCourseController.listEnrollmentCourses);

router.post(
  "/:id/drop",
  requireRole(LIFECYCLE_ROLES),
  leadCourseController.dropEnrollment,
);
router.post(
  "/:id/reinstate",
  requireRole(LIFECYCLE_ROLES),
  leadCourseController.reinstateEnrollment,
);
// `:id` is the DROPPED enrollment being restarted from, not the new one.
router.post(
  "/:id/re-enroll",
  requireRole(LIFECYCLE_ROLES),
  leadCourseController.reEnrollCourse,
);

// Move a student to another cohort — recorded as a deferral, optionally with a
// fee. Same pair as the rest of the lifecycle: this shifts a batch's upcoming
// revenue and can add a charge, so it belongs with the people who own the money.
//
// Replaces PUT /payment/courses/details, which had neither a role check nor a
// scope check — any signed-in user could move any enrollment.
//
// multipart: the optional fee may carry proof screenshots, exactly as
// POST /payment/record does.
router.post(
  "/:id/change-cohort",
  requireRole(LIFECYCLE_ROLES),
  uploadPaymentProof.array("attachments", PROOF_MAX_FILES),
  leadCourseController.changeEnrollmentCohort,
);

// Readable by anyone who can see the enrollment — the move is part of the
// student's record, not a privileged fact.
router.get("/:id/cohort-history", leadCourseController.listCohortHistory);

module.exports = router;
