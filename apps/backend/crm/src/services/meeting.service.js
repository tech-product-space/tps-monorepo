"use strict";
const { Op, fn, col } = require("sequelize");
const {
  Meeting,
  Lead,
  LeadProfile,
  LeadNote,
  User,
  Status,
  Activity,
} = require("../models");
const googleService = require("./google.service");
const { parsePagination, buildPage } = require("../utils/pagination");
const { ROLES, hasGlobalScope } = require("../config/constants/roles");

const MIN_DURATION_MIN = 15;
const MAX_DURATION_MIN = 480;
const DEFAULT_TIMEZONE = "Asia/Kolkata";

// LeadNote.type only allows 'Note' | 'Conversation'. A meeting outcome is a
// record of what was said on a call, so it rides as a Conversation rather than
// widening the enum.
const OUTCOME_NOTE_TYPE = "Conversation";

const OUTCOME_LABELS = {
  attended: "Attended",
  no_show: "No-show",
  cancelled_late: "Cancelled by lead",
};

// The verdicts a finished meeting can carry, used both when logging an outcome
// and when filtering the Done list by it.
const VALID_OUTCOMES = Object.keys(OUTCOME_LABELS);

// Same identification the followup cron uses for the meeting-related status.
const MENTOR_STATUS_ID = process.env.FOLLOWUP_MENTOR_STATUS_ID || null;
const MENTOR_LABEL = (
  process.env.FOLLOWUP_MENTOR_STATUS_LABEL || "Mentor Call Booked"
)
  .trim()
  .toLowerCase();

// Statuses suggested when logging an outcome. Same id-or-label resolution as
// the mentor/cancel statuses above; all three are optional — if one doesn't
// resolve, that verdict simply offers no pre-fill and the rep picks a status.
const ATTENDED_STATUS_ID = process.env.MEETING_ATTENDED_STATUS_ID || null;
const ATTENDED_LABEL = (
  process.env.MEETING_ATTENDED_STATUS_LABEL || "Mentor Call Done"
)
  .trim()
  .toLowerCase();
const NOSHOW_STATUS_ID = process.env.MEETING_NOSHOW_STATUS_ID || null;
const NOSHOW_LABEL = (
  process.env.MEETING_NOSHOW_STATUS_LABEL || "Mentor Call Not Attended"
)
  .trim()
  .toLowerCase();
// A lead who cancelled gets their own status rather than sharing "Done" with
// someone who actually attended — the call never happened, and the pipeline
// should say so. Only a pre-fill; the dropdown still offers everything else.
const CANCELLED_LATE_STATUS_ID =
  process.env.MEETING_CANCELLED_LATE_STATUS_ID || null;
const CANCELLED_LATE_LABEL = (
  process.env.MEETING_CANCELLED_LATE_STATUS_LABEL || "Mentor Call Cancelled"
)
  .trim()
  .toLowerCase();

// How long a meeting may sit unlogged before the queue calls it stale.
const STALE_OUTCOME_DAYS = Number(process.env.MEETING_STALE_OUTCOME_DAYS || 3);

// Status applied to the lead when a status-synced meeting is cancelled.
const CANCEL_STATUS_ID = process.env.MEETING_CANCEL_STATUS_ID || null;
const CANCEL_LABEL = (
  process.env.MEETING_CANCEL_STATUS_LABEL || "Mentor Call Cancelled"
)
  .trim()
  .toLowerCase();

const MAX_ATTACHMENTS = 5;

function httpError(status, code, message) {
  const err = new Error(message || code);
  err.status = status;
  err.code = code;
  return err;
}

/**
 * Attendee candidates a user may invite to a meeting:
 *   Agent        → own manager + active Superadmins
 *   Manager      → own team's active Agents + active Superadmins
 *   global roles → all active users (Superadmin, Program Manager)
 * Always excludes self, and anyone without an email — there is nobody to
 * invite. Shared by GET /users/meeting-attendees and the server-side
 * validation in createMeeting/updateMeeting, so the picker can never offer
 * someone the API would then reject.
 *
 * Internal users only. The lead themself is added separately in createMeeting,
 * off their profile email; there is no free-text box for outside guests.
 */
async function getAttendeeCandidates(user) {
  const attributes = ["id", "name", "email", "role"];
  let where;
  if (hasGlobalScope(user.role)) {
    where = { is_active: true };
  } else if (user.role === ROLES.MANAGER) {
    where = {
      is_active: true,
      [Op.or]: [{ manager_id: user.id }, { role: ROLES.SUPERADMIN }],
    };
  } else {
    // Agent
    const or = [{ role: ROLES.SUPERADMIN }];
    if (user.manager_id) or.push({ id: user.manager_id });
    where = { is_active: true, [Op.or]: or };
  }
  const users = await User.findAll({ where, attributes });
  return users.filter((u) => u.id !== user.id && u.email);
}

/** Mirrors existing lead scoping: Agent owns lead; Manager: self or subordinate; global roles: any. */
async function assertLeadVisible(user, lead) {
  if (hasGlobalScope(user.role)) return;
  const agentId = lead.agent_id ? lead.agent_id.toString() : null;
  if (user.role === ROLES.AGENT) {
    if (agentId !== user.id.toString()) {
      throw httpError(403, "FORBIDDEN", "You do not have access to this lead");
    }
    return;
  }
  // Manager
  if (agentId === user.id.toString()) return;
  const subordinates = await User.findAll({
    where: { manager_id: user.id },
    attributes: ["id"],
  });
  const ids = subordinates.map((s) => s.id.toString());
  if (!agentId || !ids.includes(agentId)) {
    throw httpError(403, "FORBIDDEN", "You do not have access to this lead");
  }
}

/** Manager's own id + their direct-report agents' ids, for team-scoped views. */
async function getTeamUserIds(user) {
  const subordinates = await User.findAll({
    where: { manager_id: user.id },
    attributes: ["id"],
  });
  return [user.id.toString(), ...subordinates.map((s) => s.id.toString())];
}

/** Users the caller can filter the team/all meetings view by organizer. */
async function getOrganizerOptions(user) {
  if (hasGlobalScope(user.role)) {
    return User.findAll({
      where: { is_active: true },
      attributes: ["id", "name", "email"],
      order: [["name", "ASC"]],
    });
  }
  const ids = await getTeamUserIds(user);
  return User.findAll({
    where: { id: { [Op.in]: ids }, is_active: true },
    attributes: ["id", "name", "email"],
    order: [["name", "ASC"]],
  });
}

/**
 * Matches a search term against the meeting title or the lead's profile —
 * name, email, or phone. Phone is matched on digits only (stored normalized),
 * and only when the term carries enough digits (3+) to read as a number, so a
 * name that happens to contain a stray digit doesn't pull in every lead.
 */
async function buildSearchWhere(search) {
  const raw = search.trim();
  const term = `%${raw}%`;

  const profileOr = [
    { name: { [Op.iLike]: term } },
    { email: { [Op.iLike]: term } },
  ];
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 3) {
    profileOr.push({ phone: { [Op.iLike]: `%${digits}%` } });
  }

  const matchingProfiles = await LeadProfile.findAll({
    where: { [Op.or]: profileOr },
    attributes: ["id"],
  });
  const profileIds = matchingProfiles.map((p) => p.id);
  return {
    [Op.or]: [
      { title: { [Op.iLike]: term } },
      ...(profileIds.length ? [{ profile_id: { [Op.in]: profileIds } }] : []),
    ],
  };
}

/** Meeting counts per organizer matching a where-clause, keyed by organizer_id. */
async function countsByOrganizer(where) {
  const rows = await Meeting.findAll({
    where,
    attributes: ["organizer_id", [fn("COUNT", col("id")), "count"]],
    group: ["organizer_id"],
    raw: true,
  });
  return new Map(rows.map((r) => [r.organizer_id, parseInt(r.count, 10)]));
}

/**
 * Per-organizer meeting totals for the team/all scope — includes organizers
 * with zero meetings so a Manager/Superadmin can see who isn't scheduling
 * anything, not just who is. Honors the same search/date filters as the
 * list view; sorted busiest-first.
 */
async function getOrganizerStats(user, { search, startDate, endDate } = {}) {
  const teamIds =
    hasGlobalScope(user.role) ? null : await getTeamUserIds(user);
  const scopeWhere = teamIds ? { organizer_id: { [Op.in]: teamIds } } : {};

  if (search && search.trim()) {
    scopeWhere[Op.and] = [
      ...(scopeWhere[Op.and] || []),
      await buildSearchWhere(search),
    ];
  }
  if (startDate || endDate) {
    // Expected as full ISO datetimes (the frontend resolves the day boundary
    // in the browser's local timezone before sending).
    const range = {};
    if (startDate) range[Op.gte] = new Date(startDate);
    if (endDate) range[Op.lte] = new Date(endDate);
    scopeWhere.start_time = range;
  }

  const now = new Date();
  const [organizers, upcomingMap, needsOutcomeMap, doneMap, cancelledMap] =
    await Promise.all([
      getOrganizerOptions(user),
      countsByOrganizer(applyFilterWhere(scopeWhere, "upcoming", now)),
      countsByOrganizer(applyFilterWhere(scopeWhere, "needs_outcome", now)),
      countsByOrganizer(applyFilterWhere(scopeWhere, "done", now)),
      countsByOrganizer(applyFilterWhere(scopeWhere, "cancelled", now)),
    ]);

  const stats = organizers.map((o) => {
    const upcoming = upcomingMap.get(o.id) || 0;
    const needsOutcome = needsOutcomeMap.get(o.id) || 0;
    const done = doneMap.get(o.id) || 0;
    const cancelled = cancelledMap.get(o.id) || 0;
    return {
      organizer_id: o.id,
      name: o.name,
      email: o.email,
      upcoming,
      needs_outcome: needsOutcome,
      done,
      cancelled,
      total: upcoming + needsOutcome + done + cancelled,
    };
  });

  stats.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
  return stats;
}

async function resolveAttendees(user, attendeeUserIds) {
  const ids = [...new Set(attendeeUserIds || [])];
  if (!ids.length) return [];
  const candidates = await getAttendeeCandidates(user);
  const byId = new Map(candidates.map((c) => [c.id.toString(), c]));
  const resolved = [];
  for (const id of ids) {
    const candidate = byId.get(id.toString());
    if (!candidate) {
      throw httpError(
        400,
        "INVALID_ATTENDEE",
        "One or more attendees are not allowed for your role",
      );
    }
    resolved.push(candidate);
  }
  return resolved;
}

function validateSchedule(startTime, durationMinutes) {
  const start = new Date(startTime);
  if (isNaN(start.getTime())) {
    throw httpError(400, "INVALID_START", "Invalid start time");
  }
  if (start.getTime() < Date.now() - 60 * 1000) {
    throw httpError(400, "START_IN_PAST", "Meeting start must be in the future");
  }
  const duration = Number(durationMinutes);
  if (
    !Number.isFinite(duration) ||
    duration < MIN_DURATION_MIN ||
    duration > MAX_DURATION_MIN
  ) {
    throw httpError(
      400,
      "INVALID_DURATION",
      `Duration must be between ${MIN_DURATION_MIN} and ${MAX_DURATION_MIN} minutes`,
    );
  }
  const end = new Date(start.getTime() + duration * 60 * 1000);
  return { start, end };
}

async function resolveStatus(statusId, label) {
  if (statusId) {
    const byId = await Status.findByPk(statusId);
    if (byId) return byId;
  }
  return Status.findOne({
    where: {
      is_deactivated: false,
      [Op.and]: [
        Status.sequelize.where(
          Status.sequelize.fn("LOWER", Status.sequelize.col("label")),
          label,
        ),
      ],
    },
  });
}

const resolveMentorStatus = () => resolveStatus(MENTOR_STATUS_ID, MENTOR_LABEL);
const resolveCancelStatus = () => resolveStatus(CANCEL_STATUS_ID, CANCEL_LABEL);

// Matches the StatusChange/FollowUp activity shapes written by
// lead.controller.js updateLead — reports depend on metadata.new.status_id.
async function writeStatusSyncActivities({
  lead,
  actorId,
  oldStatusId,
  newStatus,
  oldFollowup,
  newFollowup,
  // Defaults to GoogleMeet because every caller but logOutcome is a Google-only
  // path — a Cal.com booking can't be created, edited or cancelled from here.
  // logOutcome can be reached by either, and passes its meeting's real source.
  source = "GoogleMeet",
}) {
  const oldStatusObj = oldStatusId ? await Status.findByPk(oldStatusId) : null;
  const oldStatusLabel = oldStatusObj ? oldStatusObj.label : oldStatusId;

  if (newStatus && newStatus.id !== oldStatusId) {
    await Activity.create({
      lead_id: lead.id,
      profile_id: lead.profile_id,
      type: "StatusChange",
      title: "Status Updated",
      details: `Status changed from "${oldStatusLabel}" to "${newStatus.label}"`,
      actor_id: actorId,
      metadata: {
        source,
        updated_by: actorId,
        old: {
          status_id: oldStatusId,
          status_label: oldStatusLabel,
          loss_reason: lead.loss_reason || null,
        },
        new: {
          status_id: newStatus.id,
          status_label: newStatus.label,
          loss_reason: lead.loss_reason || null,
        },
      },
    });
  }

  if (String(newFollowup) !== String(oldFollowup)) {
    await Activity.create({
      lead_id: lead.id,
      profile_id: lead.profile_id,
      type: "FollowUp",
      title: "Follow-up Updated",
      details: newFollowup
        ? `Follow-up set to ${new Date(newFollowup).toLocaleString()}`
        : "Follow-up cleared",
      actor_id: actorId,
      metadata: {
        source,
        updated_by: actorId,
        old: { next_followup: oldFollowup },
        new: { next_followup: newFollowup },
      },
    });
  }
}

async function createMeeting(user, payload, files) {
  const {
    lead_id,
    title,
    description,
    start_time,
    duration_minutes,
    attendee_user_ids,
    sync_status,
    timezone,
    follows_meeting_id,
  } = payload || {};

  if (files && files.length > MAX_ATTACHMENTS) {
    throw httpError(
      400,
      "TOO_MANY_ATTACHMENTS",
      `At most ${MAX_ATTACHMENTS} attachments are allowed`,
    );
  }

  if (!lead_id || !title || !start_time || !duration_minutes) {
    throw httpError(
      400,
      "MISSING_FIELDS",
      "lead_id, title, start_time and duration_minutes are required",
    );
  }
  const { start, end } = validateSchedule(start_time, duration_minutes);
  const tz = timezone || DEFAULT_TIMEZONE;

  const lead = await Lead.findByPk(lead_id, {
    include: [{ model: LeadProfile, as: "Profile" }],
  });
  if (!lead || lead.is_deleted) {
    throw httpError(404, "LEAD_NOT_FOUND", "Lead not found");
  }
  await assertLeadVisible(user, lead);

  const internalAttendees = await resolveAttendees(user, attendee_user_ids);

  const warnings = [];
  const attendeeEmails = internalAttendees.map((a) => a.email);
  const leadEmail = lead.Profile?.email || null;
  if (leadEmail) {
    attendeeEmails.push(leadEmail);
  } else {
    warnings.push("LEAD_EMAIL_MISSING");
  }

  // Attachments live in the organizer's Drive; uploaded before the event so
  // they can be attached at creation time.
  const attachments = [];
  for (const file of files || []) {
    attachments.push(
      await googleService.uploadAttachment(user.id, {
        name: file.originalname,
        mimeType: file.mimetype,
        buffer: file.buffer,
      }),
    );
  }

  // Google first: if event creation fails, nothing was persisted locally.
  const { eventId, meetLink } = await googleService.createEvent(user.id, {
    title,
    description,
    startUtc: start.toISOString(),
    endUtc: end.toISOString(),
    timezone: tz,
    attendeeEmails,
    attachments,
  });

  const attendeesSnapshot = [
    ...internalAttendees.map((a) => ({
      email: a.email,
      user_id: a.id,
      name: a.name,
      type: "internal",
    })),
    ...(leadEmail
      ? [
          {
            email: leadEmail,
            user_id: null,
            name: lead.Profile?.name || "Lead",
            type: "lead",
          },
        ]
      : []),
  ];

  let meeting;
  try {
    meeting = await Meeting.create({
      lead_id: lead.id,
      profile_id: lead.profile_id,
      organizer_id: user.id,
      google_event_id: eventId,
      calendar_id: "primary",
      meet_link: meetLink,
      title,
      description: description || null,
      start_time: start,
      end_time: end,
      timezone: tz,
      status: "scheduled",
      attendees: attendeesSnapshot,
      attachments,
    });
  } catch (err) {
    // Avoid an orphan Google event if the DB write fails.
    await googleService
      .deleteEvent(user.id, eventId)
      .catch((cleanupErr) =>
        console.error("[meeting] compensating delete failed:", cleanupErr),
      );
    throw err;
  }

  const startIst = start.toLocaleString("en-IN", { timeZone: tz });
  await Activity.create({
    lead_id: lead.id,
    profile_id: lead.profile_id,
    type: "System",
    title: "Google Meet Scheduled",
    details: `"${title}" on ${startIst}${meetLink ? ` — ${meetLink}` : ""}`,
    actor_id: user.id,
    metadata: {
      source: "GoogleMeet",
      meeting_id: meeting.id,
      google_event_id: eventId,
      meet_link: meetLink,
      start_time: start.toISOString(),
      attendees: attendeesSnapshot,
    },
  });

  // Booked as the follow-up to a meeting whose outcome was just logged — link
  // the two so the Done card can point at what came next. Best-effort: the
  // meeting itself is already real, and a missing back-link is cosmetic.
  if (follows_meeting_id) {
    const previous = await Meeting.findByPk(follows_meeting_id, {
      include: [{ model: Lead, as: "Lead" }],
    });
    if (previous && isMeetingParticipant(user, previous)) {
      await previous.update({ next_meeting_id: meeting.id });
    } else {
      warnings.push("PREVIOUS_MEETING_NOT_LINKED");
    }
  }

  if (sync_status) {
    const mentorStatus = await resolveMentorStatus();
    if (!mentorStatus) {
      warnings.push("STATUS_NOT_FOUND");
    } else {
      const oldStatusId = lead.status_id;
      const oldFollowup = lead.next_followup;
      await lead.update({
        status_id: mentorStatus.id,
        next_followup: start,
      });
      await meeting.update({ status_synced: true });
      await writeStatusSyncActivities({
        lead,
        actorId: user.id,
        oldStatusId,
        newStatus: mentorStatus,
        oldFollowup,
        newFollowup: start.toISOString(),
      });
    }
  }

  return { meeting, warnings };
}

async function loadOwnMeeting(user, meetingId) {
  const meeting = await Meeting.findByPk(meetingId, {
    include: [{ model: Lead, as: "Lead" }],
  });
  if (!meeting) throw httpError(404, "MEETING_NOT_FOUND", "Meeting not found");
  if (meeting.organizer_id.toString() !== user.id.toString()) {
    throw httpError(
      403,
      "NOT_ORGANIZER",
      "Only the organizer can modify this meeting",
    );
  }
  return meeting;
}

async function updateMeeting(user, meetingId, payload, files) {
  const meeting = await loadOwnMeeting(user, meetingId);
  if (meeting.status === "cancelled") {
    throw httpError(409, "MEETING_CANCELLED", "Meeting is already cancelled");
  }

  const {
    title,
    description,
    start_time,
    duration_minutes,
    attendee_user_ids,
    remove_attachment_ids,
  } = payload || {};

  const removeIds = new Set(remove_attachment_ids || []);
  const keptAttachments = (meeting.attachments || []).filter(
    (a) => !removeIds.has(a.drive_file_id),
  );
  const removedAttachments = (meeting.attachments || []).filter((a) =>
    removeIds.has(a.drive_file_id),
  );

  if (keptAttachments.length + (files || []).length > MAX_ATTACHMENTS) {
    throw httpError(
      400,
      "TOO_MANY_ATTACHMENTS",
      `At most ${MAX_ATTACHMENTS} attachments are allowed`,
    );
  }

  const newAttachments = [];
  for (const file of files || []) {
    newAttachments.push(
      await googleService.uploadAttachment(user.id, {
        name: file.originalname,
        mimeType: file.mimetype,
        buffer: file.buffer,
      }),
    );
  }

  const attachmentsChanged = removeIds.size > 0 || newAttachments.length > 0;
  const attachmentsSnapshot = attachmentsChanged
    ? [...keptAttachments, ...newAttachments]
    : undefined;

  const oldStart = new Date(meeting.start_time);
  const oldDurationMin = Math.round(
    (new Date(meeting.end_time) - oldStart) / 60000,
  );

  let start = oldStart;
  let end = new Date(meeting.end_time);
  if (start_time !== undefined || duration_minutes !== undefined) {
    const schedule = validateSchedule(
      start_time !== undefined ? start_time : meeting.start_time,
      duration_minutes !== undefined ? duration_minutes : oldDurationMin,
    );
    start = schedule.start;
    end = schedule.end;
  }

  const updates = {};
  let attendeeEmails;
  let attendeesSnapshot;

  if (attendee_user_ids !== undefined) {
    const internalAttendees = await resolveAttendees(user, attendee_user_ids);
    const leadAttendee = (meeting.attendees || []).find(
      (a) => a.type === "lead",
    );
    attendeesSnapshot = [
      ...internalAttendees.map((a) => ({
        email: a.email,
        user_id: a.id,
        name: a.name,
        type: "internal",
      })),
      ...(leadAttendee ? [leadAttendee] : []),
    ];
    attendeeEmails = attendeesSnapshot.map((a) => a.email);
    updates.attendees = attendeesSnapshot;
  }

  let patchResult;
  try {
    patchResult = await googleService.patchEvent(
      user.id,
      meeting.google_event_id,
      {
        title,
        description,
        startUtc: start.toISOString(),
        endUtc: end.toISOString(),
        timezone: meeting.timezone,
        attendeeEmails,
        attachments: attachmentsSnapshot,
      },
    );
  } catch (err) {
    // Avoid orphaning newly uploaded Drive files if the Calendar patch fails.
    for (const a of newAttachments) {
      await googleService
        .deleteAttachment(user.id, a.drive_file_id)
        .catch((cleanupErr) =>
          console.error(
            "[meeting] compensating attachment delete failed:",
            cleanupErr,
          ),
        );
    }
    throw err;
  }
  if (patchResult.gone) {
    // Event was deleted directly in Google Calendar — reconcile locally.
    await meeting.update({ status: "cancelled" });
    throw httpError(
      409,
      "GOOGLE_EVENT_GONE",
      "The Google Calendar event no longer exists; meeting marked cancelled",
    );
  }

  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  updates.start_time = start;
  updates.end_time = end;
  if (attachmentsSnapshot) updates.attachments = attachmentsSnapshot;
  await meeting.update(updates);

  // Best-effort cleanup of removed attachments' Drive files, after the DB commit.
  for (const a of removedAttachments) {
    await googleService
      .deleteAttachment(user.id, a.drive_file_id)
      .catch((cleanupErr) =>
        console.error("[meeting] attachment cleanup failed:", cleanupErr),
      );
  }

  const startIst = start.toLocaleString("en-IN", { timeZone: meeting.timezone });
  await Activity.create({
    lead_id: meeting.lead_id,
    profile_id: meeting.profile_id,
    type: "System",
    title: "Google Meet Rescheduled",
    details: `"${meeting.title}" moved to ${startIst}`,
    actor_id: user.id,
    metadata: {
      source: "GoogleMeet",
      meeting_id: meeting.id,
      google_event_id: meeting.google_event_id,
      meet_link: meeting.meet_link,
      start_time: start.toISOString(),
    },
  });

  // Keep the synced follow-up aligned, but only if nobody moved it manually.
  if (
    meeting.status_synced &&
    start.getTime() !== oldStart.getTime() &&
    meeting.Lead &&
    meeting.Lead.next_followup &&
    new Date(meeting.Lead.next_followup).getTime() === oldStart.getTime()
  ) {
    const oldFollowup = meeting.Lead.next_followup;
    await meeting.Lead.update({ next_followup: start });
    await writeStatusSyncActivities({
      lead: meeting.Lead,
      actorId: user.id,
      oldStatusId: meeting.Lead.status_id,
      newStatus: null,
      oldFollowup,
      newFollowup: start.toISOString(),
    });
  }

  return meeting;
}

async function cancelMeeting(user, meetingId) {
  const meeting = await loadOwnMeeting(user, meetingId);
  if (meeting.status === "cancelled") {
    throw httpError(409, "MEETING_CANCELLED", "Meeting is already cancelled");
  }

  await googleService.deleteEvent(user.id, meeting.google_event_id);
  await meeting.update({ status: "cancelled" });

  await Activity.create({
    lead_id: meeting.lead_id,
    profile_id: meeting.profile_id,
    type: "System",
    title: "Google Meet Cancelled",
    details: `"${meeting.title}" was cancelled`,
    actor_id: user.id,
    metadata: {
      source: "GoogleMeet",
      meeting_id: meeting.id,
      google_event_id: meeting.google_event_id,
    },
  });

  // Status-synced meetings move the lead to the cancelled status and clear
  // the follow-up that was set at scheduling time.
  if (meeting.status_synced && meeting.Lead) {
    const lead = meeting.Lead;
    const cancelStatus = await resolveCancelStatus();
    const oldStatusId = lead.status_id;
    const oldFollowup = lead.next_followup;

    const leadUpdates = { next_followup: null };
    if (cancelStatus && cancelStatus.id !== oldStatusId) {
      leadUpdates.status_id = cancelStatus.id;
    }
    await lead.update(leadUpdates);

    await writeStatusSyncActivities({
      lead,
      actorId: user.id,
      oldStatusId,
      newStatus:
        cancelStatus && cancelStatus.id !== oldStatusId ? cancelStatus : null,
      oldFollowup,
      newFollowup: null,
    });
  }

  return meeting;
}

/**
 * Whether `user` was one of the people this meeting actually belonged to:
 * organizer, any invited internal attendee, or the lead's owner. Attendees are
 * included deliberately — the mentor is usually a guest, not the organizer, so
 * an organizer-only rule would exclude the one person who was on the call.
 *
 * Kept separate from `isMeetingParticipant` because a Superadmin override
 * passes that gate without being any of the above, and the audit trail wants to
 * know the difference.
 */
function wasOnTheCall(user, meeting) {
  const uid = user.id.toString();
  // organizer_id is nullable since Cal.com bookings arrived: a booking nobody
  // has been assigned has no organizer. Guard it — an unguarded .toString()
  // here would 500 every list response the row appears in, not just this check.
  if (meeting.organizer_id && meeting.organizer_id.toString() === uid) {
    return true;
  }
  for (const attendee of meeting.attendees || []) {
    if (attendee.user_id && attendee.user_id.toString() === uid) return true;
  }
  const agentId = meeting.Lead?.agent_id;
  if (agentId) return agentId.toString() === uid;
  // An unassigned Cal.com booking has no participant to speak of: the lead
  // booked it themselves and nobody on the team has picked it up. "Were you
  // there?" has no answer, so defer wholly to assertLeadVisible below — the
  // same call the booking cron already makes when it routes these to
  // Superadmins. Google meetings always have an organizer and never land here.
  return meeting.source === "calcom";
}

/**
 * Whether `user` may report what happened at `meeting`.
 *
 * Anyone who was on the call, plus Superadmins regardless of participation.
 * Someone has to be able to clear a row the person who was actually there can
 * no longer touch — they've left, the lead was never picked up, or the queue has
 * simply gone stale — and before the override the queue had no escape hatch.
 * It isn't a hole in the audit trail: `outcome_by` names whoever pressed the
 * button and `logOutcome` flags an override as such.
 *
 * Managers get no override — seeing a meeting in the team view isn't knowing
 * what happened at it, so a manager logs only their own calls and their own
 * leads'. `assertLeadVisible` is the second gate either way, so an outcome can
 * never write to a lead the logger couldn't otherwise open.
 */
function isMeetingParticipant(user, meeting) {
  return user.role === "Superadmin" || wasOnTheCall(user, meeting);
}

/** Loads a meeting the caller may log an outcome on, or throws. */
async function loadLoggableMeeting(user, meetingId) {
  const meeting = await Meeting.findByPk(meetingId, {
    include: [{ model: Lead, as: "Lead" }],
  });
  if (!meeting) throw httpError(404, "MEETING_NOT_FOUND", "Meeting not found");
  if (!isMeetingParticipant(user, meeting)) {
    throw httpError(
      403,
      "NOT_PARTICIPANT",
      "Only the organizer, an invited attendee, or the lead's owner can log this outcome",
    );
  }
  if (!meeting.Lead) {
    throw httpError(404, "LEAD_NOT_FOUND", "Lead not found");
  }
  // Writing a status/note means touching the lead — same rule as everywhere else.
  await assertLeadVisible(user, meeting.Lead);
  return meeting;
}

const resolveAttendedStatus = () =>
  resolveStatus(ATTENDED_STATUS_ID, ATTENDED_LABEL);
const resolveNoShowStatus = () => resolveStatus(NOSHOW_STATUS_ID, NOSHOW_LABEL);
const resolveCancelledLateStatus = () =>
  resolveStatus(CANCELLED_LATE_STATUS_ID, CANCELLED_LATE_LABEL);

/**
 * Records what happened at a meeting that has already ended, and applies the
 * follow-up work in one go: the lead's status, a note on their timeline, and
 * the next follow-up date.
 *
 * Booking the next call is deliberately NOT done here — it needs Google, Drive
 * and multer, all of which POST /meetings already owns. The frontend calls
 * this first (cheap, transactional) and then POST /meetings with
 * follows_meeting_id. If the booking fails the outcome still stands, which is
 * the failure mode we want: a logged meeting with no next call is recoverable,
 * a Meet on someone's calendar with no record of why is not.
 */
async function logOutcome(user, meetingId, payload) {
  const { outcome, status_id, note, next_followup } = payload || {};

  if (!VALID_OUTCOMES.includes(outcome)) {
    throw httpError(
      400,
      "INVALID_OUTCOME",
      "Outcome must be attended, no_show or cancelled_late",
    );
  }

  const meeting = await loadLoggableMeeting(user, meetingId);

  if (meeting.status === "cancelled") {
    throw httpError(
      409,
      "MEETING_CANCELLED",
      "A cancelled meeting has no outcome to log",
    );
  }
  if (new Date(meeting.end_time).getTime() > Date.now()) {
    throw httpError(
      409,
      "MEETING_NOT_ENDED",
      "This meeting hasn't finished yet",
    );
  }
  if (meeting.outcome) {
    throw httpError(
      409,
      "OUTCOME_ALREADY_LOGGED",
      "Someone has already logged an outcome for this meeting",
    );
  }

  const lead = meeting.Lead;
  const warnings = [];

  let newStatus = null;
  if (status_id) {
    newStatus = await Status.findByPk(status_id);
    if (!newStatus) {
      throw httpError(400, "INVALID_STATUS", "Unknown status");
    }
  }

  const oldStatusId = lead.status_id;
  const oldFollowup = lead.next_followup;
  const followupDate = next_followup ? new Date(next_followup) : null;
  if (next_followup && isNaN(followupDate.getTime())) {
    throw httpError(400, "INVALID_FOLLOWUP", "Invalid follow-up date");
  }

  // This is the one write path a Cal.com booking can reach — it can't be
  // created, edited or cancelled from the CRM — so the audit trail must name the
  // source it actually came from rather than the hardcoded "GoogleMeet" every
  // Google-only path above can safely assume.
  const activitySource = meeting.source === "calcom" ? "Cal.com" : "GoogleMeet";

  // A Superadmin clearing someone else's row: same write, but the timeline says
  // so. Without this the note reads as first-hand ("Attended") from someone who
  // wasn't there, which is exactly the kind of record nobody can later audit.
  const onBehalf = !wasOnTheCall(user, meeting);

  const transaction = await Meeting.sequelize.transaction();
  let noteRow = null;
  try {
    if (note && note.trim()) {
      noteRow = await LeadNote.create(
        {
          lead_id: lead.id,
          profile_id: lead.profile_id,
          actor_id: user.id,
          type: OUTCOME_NOTE_TYPE,
          content: note.trim(),
          metadata: {
            source: activitySource,
            meeting_id: meeting.id,
            outcome,
            on_behalf: onBehalf,
          },
        },
        { transaction },
      );
    }

    const leadUpdates = { next_followup: followupDate };
    if (newStatus) leadUpdates.status_id = newStatus.id;
    await lead.update(leadUpdates, { transaction });

    await meeting.update(
      {
        outcome,
        outcome_at: new Date(),
        outcome_by: user.id,
        outcome_note_id: noteRow ? noteRow.id : null,
      },
      { transaction },
    );

    await transaction.commit();
  } catch (err) {
    await transaction.rollback();
    throw err;
  }

  // Activities are written after the commit: they're an audit trail, not part
  // of the invariant, and a failure here shouldn't undo a logged outcome.
  await Activity.create({
    lead_id: lead.id,
    profile_id: lead.profile_id,
    type: "System",
    title: "Meeting Outcome Logged",
    details: `"${meeting.title}" — ${OUTCOME_LABELS[outcome]}${
      onBehalf ? " (logged by admin, not a participant)" : ""
    }`,
    actor_id: user.id,
    metadata: {
      source: activitySource,
      meeting_id: meeting.id,
      outcome,
      note_id: noteRow ? noteRow.id : null,
      on_behalf: onBehalf,
    },
  });

  await writeStatusSyncActivities({
    lead,
    actorId: user.id,
    oldStatusId,
    newStatus: newStatus && newStatus.id !== oldStatusId ? newStatus : null,
    oldFollowup,
    newFollowup: followupDate ? followupDate.toISOString() : null,
    source: activitySource,
  });

  return { meeting, warnings };
}

/**
 * How many of my meetings are waiting on an outcome. Drives the sidebar badge,
 * so it's a single COUNT rather than a reuse of listMyMeetings — that would
 * run six counts, a findAll and a Cal.com fetch to produce one number, on
 * every page load. Same "mine" scope as the list: organiser or invited guest.
 */
async function countMyNeedsOutcome(user) {
  const baseWhere = {
    [Op.or]: [
      { organizer_id: user.id },
      { attendees: { [Op.contains]: [{ user_id: user.id }] } },
    ],
  };
  return Meeting.count({
    where: applyFilterWhere(baseWhere, "needs_outcome", new Date()),
  });
}

/**
 * The statuses the outcome panel pre-selects per verdict. Each is optional —
 * unset or unmatched simply means no pre-fill for that verdict and the rep
 * chooses. Returned to the client so the mapping lives in one place (env)
 * rather than being duplicated as hardcoded labels in the frontend.
 */
async function getOutcomeStatusSuggestions() {
  const [attended, noShow, cancelledLate] = await Promise.all([
    resolveAttendedStatus(),
    resolveNoShowStatus(),
    resolveCancelledLateStatus(),
  ]);
  return {
    attended: attended ? attended.id : null,
    no_show: noShow ? noShow.id : null,
    cancelled_late: cancelledLate ? cancelledLate.id : null,
  };
}

/**
 * Applies the all/upcoming/needs_outcome/done/cancelled filter on top of a
 * base where-clause. Bucketing is by end_time (not start_time) so a meeting
 * that has started but hasn't ended yet is still "upcoming" rather than
 * awaiting an outcome. "all" applies no status/time restriction at all.
 *
 * needs_outcome and done split what used to be one clock-derived "completed"
 * bucket: both have ended, but only `outcome` says whether a human has
 * actually reported what happened.
 */
function applyFilterWhere(baseWhere, filter, now) {
  const where = { ...baseWhere };
  if (filter === "all") {
    return where;
  }
  if (filter === "cancelled") {
    where.status = "cancelled";
  } else if (filter === "needs_outcome") {
    // Ended, but nobody has said what happened. The work queue.
    where.status = "scheduled";
    where.end_time = { [Op.lt]: now };
    where.outcome = { [Op.is]: null };
  } else if (filter === "done") {
    // Ended and logged. "Done" is a verdict, not a timestamp.
    where.status = "scheduled";
    where.outcome = { [Op.ne]: null };
  } else {
    // upcoming: still ahead of us, or happening right now.
    where.status = "scheduled";
    where.end_time = { [Op.gte]: now };
  }
  return where;
}

/** Start/end of the caller's "today" in the app timezone, as UTC instants. */
function todayRange(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  // Offset between the app timezone and UTC at this instant, so a plain
  // "yyyy-mm-dd" boundary can be expressed as a UTC range.
  const asUtc = new Date(`${parts}T00:00:00Z`);
  const offsetMs =
    new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime() -
    new Date(now.toLocaleString("en-US", { timeZone: DEFAULT_TIMEZONE })).getTime();
  const start = new Date(asUtc.getTime() + offsetMs);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

/**
 * Counts per bucket for a base where-clause, plus the two secondary numbers
 * the stat tiles show: how much of the queue has gone stale, and how much of
 * the upcoming work lands today.
 */
async function getMeetingCounts(baseWhere) {
  const now = new Date();
  const staleBefore = new Date(
    now.getTime() - STALE_OUTCOME_DAYS * 24 * 60 * 60 * 1000,
  );
  const today = todayRange(now);

  // Each outcome is a subset of "done", so they share its base where-clause.
  const doneWhere = applyFilterWhere(baseWhere, "done", now);

  const [
    upcoming,
    needsOutcome,
    done,
    cancelled,
    needsOutcomeStale,
    upcomingToday,
    attended,
    noShow,
    cancelledLate,
  ] = await Promise.all([
    Meeting.count({ where: applyFilterWhere(baseWhere, "upcoming", now) }),
    Meeting.count({ where: applyFilterWhere(baseWhere, "needs_outcome", now) }),
    Meeting.count({ where: doneWhere }),
    Meeting.count({ where: applyFilterWhere(baseWhere, "cancelled", now) }),
    Meeting.count({
      where: {
        ...applyFilterWhere(baseWhere, "needs_outcome", now),
        end_time: { [Op.lt]: staleBefore },
      },
    }),
    Meeting.count({
      where: {
        ...applyFilterWhere(baseWhere, "upcoming", now),
        start_time: { [Op.gte]: today.start, [Op.lt]: today.end },
      },
    }),
    Meeting.count({ where: { ...doneWhere, outcome: "attended" } }),
    Meeting.count({ where: { ...doneWhere, outcome: "no_show" } }),
    Meeting.count({ where: { ...doneWhere, outcome: "cancelled_late" } }),
  ]);

  return {
    all: upcoming + needsOutcome + done + cancelled,
    upcoming,
    needs_outcome: needsOutcome,
    done,
    cancelled,
    needs_outcome_stale: needsOutcomeStale,
    upcoming_today: upcomingToday,
    // Breakdown of `done` by verdict, for the outcome sub-filter chips.
    by_outcome: {
      attended,
      no_show: noShow,
      cancelled_late: cancelledLate,
    },
  };
}

/**
 * Builds a lead-visibility predicate once per request rather than calling
 * assertLeadVisible per row — for a Manager that would be one subordinate
 * lookup per meeting. Mirrors assertLeadVisible's rules exactly.
 */
async function buildLeadVisibilityCheck(user) {
  if (hasGlobalScope(user.role)) return () => true;
  if (user.role === ROLES.AGENT) {
    const uid = user.id.toString();
    return (lead) => !!lead?.agent_id && lead.agent_id.toString() === uid;
  }
  const teamIds = new Set(await getTeamUserIds(user));
  return (lead) => !!lead?.agent_id && teamIds.has(lead.agent_id.toString());
}

/**
 * Serializes a Meeting, tagging whether this viewer may log its outcome. Sent
 * per row so the card never offers an action the API would reject — the rare
 * case being a Manager's lead whose meeting invited an Agent, who can see the
 * meeting but not the lead behind it.
 *
 * `source` now comes off the row itself: Cal.com bookings are Meeting rows like
 * any other, so there is nothing left to synthesize.
 */
function serializeMeeting(meeting, user, canSeeLead) {
  const canLog = isMeetingParticipant(user, meeting) && canSeeLead(meeting.Lead);
  return {
    ...meeting.toJSON(),
    can_log_outcome: canLog,
    // True only for a Superadmin acting on a call they weren't part of, so the
    // panel can say "you weren't on this one" before they record a verdict as
    // if they had been. Meaningless when the row isn't loggable at all.
    log_outcome_on_behalf: canLog && !wasOnTheCall(user, meeting),
  };
}

/** The joins every meeting row needs to serialize. */
function meetingIncludes() {
  return [
    // Lead is joined so serializeMeeting can resolve ownership for
    // can_log_outcome, even where the caller already knows the lead. Its
    // pipeline status rides along (StatusConfig) so the meeting card can show
    // where the lead actually stands — the first thing a rep looks for when
    // scanning the list — without a second round-trip per row.
    {
      model: Lead,
      as: "Lead",
      attributes: ["id", "product_id", "agent_id", "status_id"],
      include: [
        {
          model: Status,
          as: "StatusConfig",
          attributes: ["id", "label", "color"],
        },
      ],
    },
    // Phone rides along so the guest list can show it without a second lookup.
    // Taken from the live profile rather than the attendees snapshot, which is
    // frozen at booking time and would keep serving a number since corrected.
    {
      model: LeadProfile,
      as: "Profile",
      attributes: ["id", "name", "email", "phone", "country_code"],
    },
    { model: User, as: "Organizer", attributes: ["id", "name"] },
    { model: User, as: "OutcomeActor", attributes: ["id", "name"] },
    { model: LeadNote, as: "OutcomeNote", attributes: ["id", "content"] },
    { model: Meeting, as: "NextMeeting", attributes: ["id", "start_time", "title"] },
  ];
}

async function listMyMeetings(
  user,
  {
    filter,
    page = 1,
    limit = 20,
    scope = "mine",
    organizerIds,
    search,
    startDate,
    endDate,
    source = "all",
    outcome,
  },
) {
  const now = new Date();
  // "team" view: globally-scoped roles see every meeting; Manager sees meetings
  // organized by themself or their direct-report agents. Agents don't get
  // a team view — always fall back to the personal scope below.
  let baseWhere;
  const isTeamView =
    scope === "team" && (hasGlobalScope(user.role) || user.role === ROLES.MANAGER);
  if (isTeamView) {
    const teamIds = user.role === ROLES.MANAGER ? await getTeamUserIds(user) : null;
    baseWhere = teamIds ? { organizer_id: { [Op.in]: teamIds } } : {};

    // The organizer filter stays team-only: in the personal scope you are
    // already the only organizer, so there is nothing left to narrow.
    if (organizerIds && organizerIds.length) {
      const valid = teamIds
        ? organizerIds.filter((id) => teamIds.includes(id.toString()))
        : organizerIds;
      if (valid.length) {
        baseWhere.organizer_id = { [Op.in]: valid };
      }
    }
  } else {
    // Organizer OR internal guest (attendees JSONB contains this user_id).
    // A Cal.com booking's organizer_id is the agent who owns the lead, so this
    // scopes those correctly too without a separate rule — and an unassigned
    // one (organizer_id NULL) matches nobody's personal scope, which is right:
    // it belongs to whoever picks the lead up. Superadmins still see it in the
    // team view, whose baseWhere is unrestricted.
    baseWhere = {
      [Op.or]: [
        { organizer_id: user.id },
        { attendees: { [Op.contains]: [{ user_id: user.id }] } },
      ],
    };
  }

  // Search and date apply in BOTH scopes. They used to be team-only, which was
  // survivable while "mine" was the default and hid the filter bar — but with
  // the org-wide view as the landing scope, switching to Mine would silently
  // widen the results back out and drop filters the URL still claimed to hold.
  // Op.or (the personal scope) and Op.and (search) at the same level are ANDed
  // by Sequelize, so this composes with either branch above.
  if (search && search.trim()) {
    baseWhere[Op.and] = [
      ...(baseWhere[Op.and] || []),
      await buildSearchWhere(search),
    ];
  }
  if (startDate || endDate) {
    // Expected as full ISO datetimes (the frontend resolves the day boundary
    // in the browser's local timezone before sending).
    const range = {};
    if (startDate) range[Op.gte] = new Date(startDate);
    if (endDate) range[Op.lte] = new Date(endDate);
    baseWhere.start_time = range;
  }
  // Optional source lens: "google" only Google-Meet meetings, "calcom" only
  // Cal.com bookings, "all" (default) both. Now a plain column filter — Cal.com
  // bookings are Meeting rows, so there is nothing to merge and nothing to
  // bucket in memory.
  if (source === "google" || source === "calcom") {
    baseWhere.source = source;
  }

  const where = applyFilterWhere(baseWhere, filter, now);
  // Outcome sub-filter — narrows a finished meeting to a single verdict
  // (Attended / No-show / Cancelled by lead). Only "done" meetings carry an
  // outcome, so applying it also forces the done semantics regardless of the
  // active tile.
  if (outcome && VALID_OUTCOMES.includes(outcome)) {
    where.status = "scheduled";
    where.outcome = outcome;
  }
  const order = [["start_time", filter === "upcoming" ? "ASC" : "DESC"]];

  const { page: pageNum, limit: pageSize, offset } = parsePagination(
    { page, limit },
    { defaultLimit: 20, maxLimit: 100 },
  );

  const [{ rows: meetingRows, count: total }, counts, canSeeLead] =
    await Promise.all([
      Meeting.findAndCountAll({
        where,
        order,
        limit: pageSize,
        offset,
        include: meetingIncludes(),
      }),
      getMeetingCounts(baseWhere),
      buildLeadVisibilityCheck(user),
    ]);

  return buildPage(
    {
      rows: meetingRows.map((m) => serializeMeeting(m, user, canSeeLead)),
      count: total,
      page: pageNum,
      limit: pageSize,
    },
    { counts },
  );
}

async function listLeadMeetings(user, leadId, { filter, page = 1, limit = 20 }) {
  const lead = await Lead.findByPk(leadId);
  if (!lead || lead.is_deleted) {
    throw httpError(404, "LEAD_NOT_FOUND", "Lead not found");
  }
  await assertLeadVisible(user, lead);

  const now = new Date();
  // Google meetings belong to the lead they were booked against. Cal.com
  // bookings are matched by PERSON instead: a mentor call isn't about one
  // product, so it surfaces on every product-lead this profile has, whichever
  // one you happen to have open. That asymmetry predates Meeting rows and is
  // preserved here deliberately — it just expresses in SQL now rather than by
  // fetching Cal.com separately and merging.
  const baseWhere = lead.profile_id
    ? {
        [Op.or]: [
          { lead_id: leadId },
          { source: "calcom", profile_id: lead.profile_id },
        ],
      }
    : { lead_id: leadId };
  const where = applyFilterWhere(baseWhere, filter, now);
  const order = [["start_time", filter === "upcoming" ? "ASC" : "DESC"]];

  const { page: pageNum, limit: pageSize, offset } = parsePagination(
    { page, limit },
    { defaultLimit: 20, maxLimit: 100 },
  );

  const [{ rows: meetingRows, count: total }, counts, canSeeLead] =
    await Promise.all([
      Meeting.findAndCountAll({
        where,
        order,
        limit: pageSize,
        offset,
        include: meetingIncludes(),
      }),
      getMeetingCounts(baseWhere),
      buildLeadVisibilityCheck(user),
    ]);

  return buildPage(
    {
      rows: meetingRows.map((m) => serializeMeeting(m, user, canSeeLead)),
      count: total,
      page: pageNum,
      limit: pageSize,
    },
    { counts },
  );
}

module.exports = {
  getAttendeeCandidates,
  getOrganizerStats,
  createMeeting,
  updateMeeting,
  cancelMeeting,
  listMyMeetings,
  listLeadMeetings,
  logOutcome,
  getOutcomeStatusSuggestions,
  countMyNeedsOutcome,
};
