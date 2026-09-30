const express = require("express");
const multer = require("multer");
const router = express.Router();
const meetingController = require("../controllers/meeting.controller");
const { authenticate, requireRole } = require("../middlewares/auth.middleware");
const { ROLES } = require("../config/constants/roles");

// Attachments are held in memory and streamed to the organizer's Drive.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
});

router.use(authenticate);
// No role gate on the module itself: every role runs calls, the Program Manager
// included (canAccessMeetings). What each of them sees is decided per row by
// meeting.service — global roles see every meeting, a Manager their team's, an
// Agent their own. The meetings *report* is a different surface and stays
// supervisory; see routes/report.routes.js.

router.post("/", upload.array("attachments", 5), meetingController.createMeeting);
router.get("/", meetingController.listMyMeetings);
// Per-organizer totals behind the team view. Anyone who gets that view gets
// this: getOrganizerStats already branches on hasGlobalScope (every organizer)
// vs a Manager's team, so the Program Manager needs no special handling — only
// admission. Agents stay out; they have no team view to break down.
router.get(
  "/organizer-stats",
  requireRole([ROLES.SUPERADMIN, ROLES.MANAGER, ROLES.PROGRAM_MANAGER]),
  meetingController.getMeetingOrganizerStats,
);
router.get("/outcome-statuses", meetingController.getOutcomeStatuses);
router.get("/needs-outcome-count", meetingController.getNeedsOutcomeCount);
router.get("/lead/:leadId", meetingController.listLeadMeetings);
// JSON only — no multer. Attachments belong to the next meeting, which is
// booked via POST / with follows_meeting_id.
router.post("/:id/outcome", meetingController.logMeetingOutcome);
router.patch("/:id", upload.array("attachments", 5), meetingController.updateMeeting);
router.delete("/:id", meetingController.cancelMeeting);

module.exports = router;
