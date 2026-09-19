const { Op } = require("sequelize");
const {
  Meeting,
  MeetingNotification,
  LeadProfile,
} = require("../../models");
const { sendToUser } = require("../../services/push.service");

/**
 * Google Meet push reminder dispatcher. Runs every minute.
 *
 * Meetings live in the meetings table with a real start_time column, so the
 * window filter is pure SQL (unlike the Calcom JSONB workaround). Recipients
 * are the organizer plus every internal attendee (attendees JSONB entries
 * with a user_id).
 *
 * The dedup ledger (meeting_notifications, unique on meeting/user/start/kind)
 * guarantees each (meeting, recipient, start time, offset) fires exactly once.
 * A reschedule changes start_time, which yields fresh ledger keys and
 * correctly re-reminds.
 */

// Offset (minutes before the meeting) → ledger kind.
const OFFSETS = [
  { minutes: 30, kind: "t30" },
  { minutes: 5, kind: "t5" },
  { minutes: 0, kind: "ontime" },
];

// Window we scan each tick: just past the earliest trigger (30m ahead) back a
// short grace so a skipped tick is still caught. Ledger prevents duplicates.
const LOOKAHEAD_MIN = 31;
const GRACE_MS = 2 * 60 * 1000;

function buildPayload(kind, meeting) {
  const name = meeting.Profile?.name || "Lead";
  const body = `${name} · ${meeting.title}`;

  let title;
  if (kind === "t30") title = "📅 Google Meet in 30min";
  else if (kind === "t5") title = "📅 Google Meet in 5min";
  else title = "📅 Google Meet now";

  return {
    title,
    body,
    url: meeting.profile_id
      ? `/leads/profile/${meeting.profile_id}?tab=meetings`
      : "/meetings",
    tag: `meeting-${kind}-${meeting.id}`,
    data: { meetLink: meeting.meet_link },
  };
}

function recipientsOf(meeting) {
  const ids = new Set([meeting.organizer_id]);
  for (const attendee of meeting.attendees || []) {
    if (attendee.user_id) ids.add(attendee.user_id);
  }
  return [...ids];
}

async function runner() {
  const now = Date.now();
  const windowStart = new Date(now - GRACE_MS);
  const windowEnd = new Date(now + LOOKAHEAD_MIN * 60 * 1000);

  const meetings = await Meeting.findAll({
    where: {
      status: "scheduled",
      start_time: { [Op.between]: [windowStart, windowEnd] },
    },
    include: [{ model: LeadProfile, as: "Profile", attributes: ["name"] }],
  });

  if (!meetings.length) {
    console.log("Meeting cron: no meetings in window.");
    return;
  }

  let firedCount = 0;
  let deviceCount = 0;

  for (const meeting of meetings) {
    const startMs = new Date(meeting.start_time).getTime();

    for (const { minutes, kind } of OFFSETS) {
      const triggerMs = startMs - minutes * 60 * 1000;

      // Due when the trigger instant has arrived (within a small grace window).
      const due = triggerMs <= now && triggerMs > now - GRACE_MS;
      if (!due) continue;

      const payload = buildPayload(kind, meeting);

      for (const userId of recipientsOf(meeting)) {
        // Claim this (meeting, recipient, start time, kind) atomically.
        const [, created] = await MeetingNotification.findOrCreate({
          where: {
            meeting_id: meeting.id,
            user_id: userId,
            start_time: meeting.start_time,
            kind,
          },
          defaults: {
            meeting_id: meeting.id,
            user_id: userId,
            start_time: meeting.start_time,
            kind,
          },
        });
        if (!created) continue; // already handled by an earlier tick

        firedCount += 1;
        try {
          const devices = await sendToUser(userId, payload);
          deviceCount += devices;
          console.log(
            `Meeting fired: meeting=${meeting.id} kind=${kind} → user ${userId} devices=${devices}`,
          );
          if (devices === 0) {
            console.warn(
              "  ⚠️  no subscribed devices — has the user enabled alerts in the CRM?",
            );
          }
        } catch (err) {
          console.error("Meeting push error:", err.message);
        }
      }
    }
  }

  console.log(
    `Meeting cron: scanned ${meetings.length} meeting(s), fired ${firedCount} reminder(s) to ${deviceCount} device(s).`,
  );
}

module.exports = runner;
module.exports.buildPayload = buildPayload;
