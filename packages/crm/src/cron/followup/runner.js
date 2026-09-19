const psEnv = require("@ps/env/crm");
const { Op } = require("sequelize");
const {
  Lead,
  LeadProfile,
  Status,
  User,
  FollowupNotification,
} = require("../../models");
const { sendToUser } = require("../../services/push.service");

/**
 * Follow-up push reminder dispatcher. Runs every minute.
 *
 * Rules:
 *   - "Mentor Call Done" follow-ups  → notify 30 min before, 5 min before, on time.
 *   - Any other active status        → notify 15 min before, on time.
 *   - Junk / Lost                    → never notify.
 *
 * A dedup ledger (followup_notifications) guarantees each
 * (lead, follow-up time, offset) fires exactly once, so polling is safe.
 */

// Statuses that never trigger a reminder. Configurable, defaults to the seeded ids.
const EXCLUDED_STATUS_IDS = (
  psEnv.FOLLOWUP_EXCLUDED_STATUS_IDS || "s_junk,s_lost"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// How "Mentor Call Done" is identified. Prefer an explicit id; fall back to label match.
const MENTOR_STATUS_ID = psEnv.FOLLOWUP_MENTOR_STATUS_ID || null;
const MENTOR_LABEL = (
  psEnv.FOLLOWUP_MENTOR_STATUS_LABEL || "Mentor Call Booked"
)
  .trim()
  .toLowerCase();

// Offset (minutes before the follow-up) → ledger kind.
const MENTOR_OFFSETS = [
  { minutes: 30, kind: "t30" },
  { minutes: 5, kind: "t5" },
  { minutes: 0, kind: "ontime" },
];
const DEFAULT_OFFSETS = [
  { minutes: 15, kind: "t15" },
  { minutes: 0, kind: "ontime" },
];

// Window we scan each tick: just past the earliest trigger (30m ahead) back a
// short grace so a skipped tick is still caught. Ledger prevents duplicates.
const LOOKAHEAD_MIN = 31;
const GRACE_MS = 2 * 60 * 1000;

function isMentorStatus(statusConfig) {
  if (!statusConfig) return false;
  if (MENTOR_STATUS_ID && statusConfig.id === MENTOR_STATUS_ID) return true;
  return (statusConfig.label || "").trim().toLowerCase() === MENTOR_LABEL;
}

function buildPayload(kind, isMentor, leadName, productId, isUnassigned) {
  const name = leadName || "Lead";
  const detail = productId ? ` · ${productId}` : "";
  const tail = isUnassigned ? " · Unassigned" : "";
  const body = `${name}${detail}${tail}`;

  let title;
  if (isMentor) {
    if (kind === "t30") title = "⏰ Mentor call in 30 min";
    else if (kind === "t5") title = "⏰ Mentor call in 5 min";
    else title = "⏰ Mentor call now";
  } else {
    if (kind === "t15") title = "🔔 Follow-up in 15 min";
    else title = "🔔 Follow-up now";
  }

  return {
    title,
    body,
    url: "/reminders",
    tag: `followup-${kind}`,
  };
}

async function runner() {
  const now = Date.now();

  const leads = await Lead.findAll({
    where: {
      is_deleted: false,
      status_id: { [Op.notIn]: EXCLUDED_STATUS_IDS },
      next_followup: {
        [Op.ne]: null,
        // Earliest trigger is 30 min before the follow-up, so only consider
        // follow-ups from (now - grace) up to (now + lookahead).
        [Op.between]: [
          new Date(now - GRACE_MS),
          new Date(now + LOOKAHEAD_MIN * 60 * 1000),
        ],
      },
    },
    include: [
      { model: LeadProfile, as: "Profile", attributes: ["name"] },
      { model: Status, as: "StatusConfig", attributes: ["id", "label"] },
    ],
    attributes: ["id", "agent_id", "next_followup", "product_id", "status_id"],
  });

  if (!leads.length) {
    console.log("Follow-up cron: no follow-ups in window.");
    return;
  }

  let firedCount = 0;
  let deviceCount = 0;

  // Unassigned follow-ups are routed to all active Superadmins.
  let superadminIds = [];
  if (leads.some((l) => !l.agent_id)) {
    const admins = await User.findAll({
      where: { role: "Superadmin", is_active: true },
      attributes: ["id"],
    });
    superadminIds = admins.map((a) => a.id);
  }

  for (const lead of leads) {
    const followupMs = new Date(lead.next_followup).getTime();
    const isMentor = isMentorStatus(lead.StatusConfig);
    const offsets = isMentor ? MENTOR_OFFSETS : DEFAULT_OFFSETS;

    // console.log(
    //   `  lead=${lead.id} status=${lead.status_id} mentor=${isMentor} ` +
    //     `agent=${lead.agent_id || "none"} ` +
    //     `followup=${new Date(lead.next_followup).toISOString()} ` +
    //     `(${((followupMs - now) / 60000).toFixed(1)} min from now)`,
    // );

    for (const { minutes, kind } of offsets) {
      const triggerMs = followupMs - minutes * 60 * 1000;

      // Due when the trigger instant has arrived (within a small grace window).
      const due = triggerMs <= now && triggerMs > now - GRACE_MS;
      if (!due) continue;

      // Claim this (lead, follow-up time, kind) atomically via the unique index.
      const [, created] = await FollowupNotification.findOrCreate({
        where: {
          lead_id: lead.id,
          followup_at: lead.next_followup,
          kind,
        },
        defaults: {
          lead_id: lead.id,
          user_id: lead.agent_id,
          followup_at: lead.next_followup,
          kind,
        },
      });

      if (!created) continue; // already handled by an earlier tick

      const isUnassigned = !lead.agent_id;

      // Assigned → the owner. Unassigned → every Superadmin.
      const recipients = isUnassigned ? superadminIds : [lead.agent_id];
      if (!recipients.length) continue;

      firedCount += 1;

      const payload = buildPayload(
        kind,
        isMentor,
        lead.Profile?.name,
        lead.product_id,
        isUnassigned,
      );

      let leadDevices = 0;
      for (const userId of recipients) {
        try {
          leadDevices += await sendToUser(userId, payload);
        } catch (err) {
          console.error("Follow-up push error:", err.message);
        }
      }
      deviceCount += leadDevices;

      console.log(
        `Follow-up fired: lead=${lead.id} kind=${kind} ${
          isUnassigned ? "→ superadmins" : `→ agent ${lead.agent_id}`
        } devices=${leadDevices}`,
      );
      if (leadDevices === 0) {
        console.warn(
          "  ⚠️  no subscribed devices for recipient(s) — has the user enabled alerts in the CRM?",
        );
      }
    }
  }

  console.log(
    `Follow-up cron: scanned ${leads.length} lead(s), fired ${firedCount} reminder(s) to ${deviceCount} device(s).`,
  );
}

module.exports = runner;
module.exports.buildPayload = buildPayload;
