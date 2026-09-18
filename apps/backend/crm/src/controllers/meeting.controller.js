"use strict";
const meetingService = require("../services/meeting.service");
const {
  GoogleNotConnectedError,
  GoogleReconnectError,
} = require("../services/google.service");

function handleError(res, err, fallbackMessage) {
  if (err instanceof GoogleNotConnectedError) {
    return res.status(409).json({ code: err.code, error: err.message });
  }
  if (err instanceof GoogleReconnectError) {
    return res.status(409).json({ code: err.code, error: err.message });
  }
  if (err.status && err.code) {
    return res.status(err.status).json({ code: err.code, error: err.message });
  }
  // Anything else that came out of the Google API layer.
  if (err.response?.status || /google/i.test(err.message || "")) {
    console.error("Google API error:", err.response?.data || err);
    return res.status(502).json({
      code: "GOOGLE_API_ERROR",
      error: "Google Calendar request failed. Please try again.",
    });
  }
  console.error(fallbackMessage, err);
  res.status(500).json({ error: fallbackMessage });
}

// POST /api/v1/meetings — JSON, or multipart/form-data when attachments
// are included (multer). Multipart sends every field as a string.
exports.createMeeting = async (req, res) => {
  try {
    const body = req.body || {};
    let attendeeIds = body.attendee_user_ids;
    if (typeof attendeeIds === "string") {
      try {
        attendeeIds = JSON.parse(attendeeIds || "[]");
      } catch {
        return res
          .status(400)
          .json({ code: "INVALID_ATTENDEE", error: "Malformed attendee list" });
      }
    }
    const payload = {
      ...body,
      duration_minutes:
        body.duration_minutes !== undefined
          ? Number(body.duration_minutes)
          : undefined,
      sync_status: body.sync_status === true || body.sync_status === "true",
      attendee_user_ids: attendeeIds,
    };

    const { meeting, warnings } = await meetingService.createMeeting(
      req.user,
      payload,
      req.files,
    );
    res.status(201).json({ meeting, warnings });
  } catch (err) {
    handleError(res, err, "Failed to schedule meeting");
  }
};

// GET /api/v1/meetings?filter=in_progress|completed|cancelled&page&limit&scope=mine|team
// &organizer_id (CSV of user ids)&search&start_date&end_date (team/all scope only)
exports.listMyMeetings = async (req, res) => {
  try {
    const organizerIds = req.query.organizer_id
      ? String(req.query.organizer_id).split(",").filter(Boolean)
      : undefined;
    const result = await meetingService.listMyMeetings(req.user, {
      filter: req.query.filter,
      page: req.query.page,
      limit: req.query.limit,
      scope: req.query.scope,
      organizerIds,
      search: req.query.search,
      startDate: req.query.start_date,
      endDate: req.query.end_date,
      source: req.query.source,
      outcome: req.query.outcome,
    });
    res.json(result);
  } catch (err) {
    handleError(res, err, "Failed to fetch meetings");
  }
};

// GET /api/v1/meetings/organizer-stats?search&start_date&end_date — per-organizer
// meeting totals for the team/all scope (Manager: their team; Superadmin: everyone).
exports.getMeetingOrganizerStats = async (req, res) => {
  try {
    const organizers = await meetingService.getOrganizerStats(req.user, {
      search: req.query.search,
      startDate: req.query.start_date,
      endDate: req.query.end_date,
    });
    res.json({ organizers });
  } catch (err) {
    handleError(res, err, "Failed to fetch organizer stats");
  }
};

// GET /api/v1/meetings/lead/:leadId?filter=in_progress|completed|cancelled&page&limit
exports.listLeadMeetings = async (req, res) => {
  try {
    const result = await meetingService.listLeadMeetings(
      req.user,
      req.params.leadId,
      {
        filter: req.query.filter,
        page: req.query.page,
        limit: req.query.limit,
      },
    );
    res.json(result);
  } catch (err) {
    handleError(res, err, "Failed to fetch lead meetings");
  }
};

// PATCH /api/v1/meetings/:id — JSON, or multipart/form-data when attachments
// are added or removed (multer). Multipart sends every field as a string.
exports.updateMeeting = async (req, res) => {
  try {
    const body = req.body || {};
    let attendeeIds = body.attendee_user_ids;
    if (typeof attendeeIds === "string") {
      try {
        attendeeIds = JSON.parse(attendeeIds || "[]");
      } catch {
        return res
          .status(400)
          .json({ code: "INVALID_ATTENDEE", error: "Malformed attendee list" });
      }
    }
    let removeAttachmentIds = body.remove_attachment_ids;
    if (typeof removeAttachmentIds === "string") {
      try {
        removeAttachmentIds = JSON.parse(removeAttachmentIds || "[]");
      } catch {
        return res.status(400).json({
          code: "INVALID_ATTACHMENTS",
          error: "Malformed attachment removal list",
        });
      }
    }
    const payload = {
      ...body,
      duration_minutes:
        body.duration_minutes !== undefined
          ? Number(body.duration_minutes)
          : undefined,
      attendee_user_ids: attendeeIds,
      remove_attachment_ids: removeAttachmentIds,
    };

    const meeting = await meetingService.updateMeeting(
      req.user,
      req.params.id,
      payload,
      req.files,
    );
    res.json({ meeting });
  } catch (err) {
    handleError(res, err, "Failed to update meeting");
  }
};

// POST /api/v1/meetings/:id/outcome — JSON only. Records what happened at a
// meeting that has ended and applies the follow-up work to the lead.
//
// Booking the next call is a separate POST /meetings with follows_meeting_id:
// that endpoint already owns Google, Drive and multer, and keeping them apart
// means a failed booking can't roll back a logged outcome.
exports.logMeetingOutcome = async (req, res) => {
  try {
    const body = req.body || {};
    const { meeting, warnings } = await meetingService.logOutcome(
      req.user,
      req.params.id,
      {
        outcome: body.outcome,
        status_id: body.status_id || null,
        note: body.note || null,
        next_followup: body.next_followup || null,
      },
    );
    res.json({ meeting, warnings });
  } catch (err) {
    handleError(res, err, "Failed to log meeting outcome");
  }
};

// GET /api/v1/meetings/outcome-statuses — which status the outcome panel
// pre-selects per verdict. Resolved from env server-side so the labels aren't
// duplicated in the frontend; null means no pre-fill and the rep picks.
exports.getOutcomeStatuses = async (_req, res) => {
  try {
    const statuses = await meetingService.getOutcomeStatusSuggestions();
    res.json({ statuses });
  } catch (err) {
    handleError(res, err, "Failed to fetch outcome statuses");
  }
};

// GET /api/v1/meetings/needs-outcome-count — one number for the sidebar badge.
exports.getNeedsOutcomeCount = async (req, res) => {
  try {
    const count = await meetingService.countMyNeedsOutcome(req.user);
    res.json({ count });
  } catch (err) {
    handleError(res, err, "Failed to fetch outcome count");
  }
};

// DELETE /api/v1/meetings/:id
exports.cancelMeeting = async (req, res) => {
  try {
    await meetingService.cancelMeeting(req.user, req.params.id);
    res.json({ success: true });
  } catch (err) {
    handleError(res, err, "Failed to cancel meeting");
  }
};
