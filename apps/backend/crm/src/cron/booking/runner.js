const { Op } = require("sequelize");
const {
  Lead,
  LeadProfile,
  Product,
  User,
  FollowupNotification,
} = require("../../models");
const { sendToUser } = require("../../services/push.service");
const { CALCOM_PRODUCT_IDS } = require("../../config/calcom");

/**
 * Cal.com booking push reminder dispatcher. Runs every minute.
 *
 * Cal.com bookings arrive as leads on one of the Cal.com products (one per
 * brand — see config/calcom.js); the scheduled call time lives in
 * extra_fields.startTime (ISO string) and the lifecycle in extra_fields.status
 * ("Booked" / "Rescheduled" / "Cancelled").
 *
 * Rules:
 *   - Active bookings (Booked / Rescheduled) → notify 30 min before, 5 min
 *     before, on time.
 *   - Cancelled / other statuses             → never notify.
 *
 * The shared dedup ledger (followup_notifications) guarantees each
 * (lead, start time, offset) fires exactly once. Booking rows use distinct
 * "bk_*" kinds so they never collide with follow-up rows. A reschedule changes
 * startTime, which yields fresh ledger keys and correctly re-reminds.
 */

// Booking statuses that should still receive reminders.
const ACTIVE_STATUSES = ["Booked", "Rescheduled"];

// Offset (minutes before the booking) → ledger kind.
const OFFSETS = [
  { minutes: 30, kind: "bk_t30" },
  { minutes: 5, kind: "bk_t5" },
  { minutes: 0, kind: "bk_ontime" },
];

// Window we scan each tick: just past the earliest trigger (30m ahead) back a
// short grace so a skipped tick is still caught. Ledger prevents duplicates.
const LOOKAHEAD_MIN = 31;
const GRACE_MS = 2 * 60 * 1000;

function buildPayload(
  kind,
  leadName,
  eventTitle,
  isUnassigned,
  profileId,
  // The booking product's own label, so a Gradient agent's lock screen says
  // "Gradient Calcom", not the other brand's name. Defaults to the original
  // wording for any caller that does not pass one.
  brandLabel = "Calcom",
) {
  const name = leadName || "Lead";
  const detail = eventTitle ? ` · ${eventTitle}` : "";
  const tail = isUnassigned ? " · Unassigned" : "";
  const body = `${name}${detail}${tail}`;

  const brand = brandLabel || "Calcom";
  let title;
  if (kind === "bk_t30") title = `📅 ${brand} Meet in 30min`;
  else if (kind === "bk_t5") title = `📅 ${brand} Meet in 5min`;
  else title = `📅 ${brand} Meet now`;

  return {
    title,
    body,
    url: profileId ? `/leads/profile/${profileId}` : "/leads",
    tag: `booking-${kind}`,
  };
}

async function runner() {
  const now = Date.now();

  // Coarse DB filter: active Cal.com bookings, across every brand's Cal.com
  // product. The precise start-time window is applied in JS below because
  // extra_fields.startTime is a JSONB ISO string and can't be range-filtered
  // cleanly in Sequelize.
  const candidates = await Lead.findAll({
    where: {
      product_id: { [Op.in]: CALCOM_PRODUCT_IDS },
      is_deleted: false,
      extra_fields: { status: { [Op.in]: ACTIVE_STATUSES } },
    },
    include: [{ model: LeadProfile, as: "Profile", attributes: ["name"] }],
    attributes: ["id", "agent_id", "profile_id", "product_id", "extra_fields"],
  });

  const windowStart = now - GRACE_MS;
  const windowEnd = now + LOOKAHEAD_MIN * 60 * 1000;

  const leads = candidates.filter((lead) => {
    const startRaw = lead.extra_fields?.startTime;
    if (!startRaw) return false;
    const startMs = new Date(startRaw).getTime();
    if (Number.isNaN(startMs)) return false;
    return startMs >= windowStart && startMs <= windowEnd;
  });

  if (!leads.length) {
    console.log("Booking cron: no bookings in window.");
    return;
  }

  let firedCount = 0;
  let deviceCount = 0;

  // Product label per Cal.com product, for the notification title. Read once
  // per tick rather than per lead; a missing row falls back to the id.
  const brandLabels = new Map();
  try {
    const calcomProducts = await Product.findAll({
      where: { id: { [Op.in]: CALCOM_PRODUCT_IDS } },
      attributes: ["id", "label"],
    });
    for (const p of calcomProducts) brandLabels.set(p.id, p.label);
  } catch (err) {
    // A label lookup failure must not cost anyone their reminder.
    console.error("Booking cron: product label lookup failed:", err.message);
  }

  // Unassigned bookings are routed to all active Superadmins.
  let superadminIds = [];
  if (leads.some((l) => !l.agent_id)) {
    const admins = await User.findAll({
      where: { role: "Superadmin", is_active: true },
      attributes: ["id"],
    });
    superadminIds = admins.map((a) => a.id);
  }

  for (const lead of leads) {
    const startRaw = lead.extra_fields.startTime;
    const startMs = new Date(startRaw).getTime();

    for (const { minutes, kind } of OFFSETS) {
      const triggerMs = startMs - minutes * 60 * 1000;

      // Due when the trigger instant has arrived (within a small grace window).
      const due = triggerMs <= now && triggerMs > now - GRACE_MS;
      if (!due) continue;

      // Claim this (lead, start time, kind) atomically via the unique index.
      const [, created] = await FollowupNotification.findOrCreate({
        where: {
          lead_id: lead.id,
          followup_at: startRaw,
          kind,
        },
        defaults: {
          lead_id: lead.id,
          user_id: lead.agent_id,
          followup_at: startRaw,
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
        lead.Profile?.name,
        lead.extra_fields?.eventTitle,
        isUnassigned,
        lead.profile_id,
        brandLabels.get(lead.product_id) || lead.product_id,
      );

      let leadDevices = 0;
      for (const userId of recipients) {
        try {
          leadDevices += await sendToUser(userId, payload);
        } catch (err) {
          console.error("Booking push error:", err.message);
        }
      }
      deviceCount += leadDevices;

      console.log(
        `Booking fired: lead=${lead.id} kind=${kind} ${
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
    `Booking cron: scanned ${leads.length} booking(s), fired ${firedCount} reminder(s) to ${deviceCount} device(s).`,
  );
}

module.exports = runner;
module.exports.buildPayload = buildPayload;
