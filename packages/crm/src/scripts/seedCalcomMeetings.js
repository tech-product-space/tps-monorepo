const psEnv = require("@ps/env/crm");
require("dotenv").config();

const { Meeting, Lead, LeadProfile, User } = require("../models");
const { Op } = require("sequelize");

/**
 * Seeds Cal.com bookings across every state the Meetings surface can show, so
 * the outcome queue can be exercised on a database that has no real Cal.com
 * traffic (beta receives no webhooks — live does).
 *
 * Writes ONLY to `meetings`, hanging rows off the Cal.com leads that already
 * exist. It deliberately doesn't invent people: fake leads would show up in the
 * lead lists and dashboards you actually browse, and the states worth testing
 * are meeting states, not lead states.
 *
 *   node src/scripts/seedCalcomMeetings.js --confirm
 *   node src/scripts/seedCalcomMeetings.js --clean
 *
 * Every row it writes is tagged with a `seed-calcom-` calcom_uid, which is both
 * how --clean finds them again and a guarantee it can never delete a real
 * booking. --confirm is required and the target host is printed first, because
 * the only thing standing between this and production data is which DATABASE_URL
 * happens to be loaded.
 */

const SEED_PREFIX = "seed-calcom-";
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

function targetHost() {
  try {
    // Host only — never print the credentials in the connection string.
    return new URL(psEnv.DATABASE_URL).host;
  } catch {
    return "(unparseable DATABASE_URL)";
  }
}

/** The states worth looking at, each one a thing that could be wrong. */
function plan(now, leads, actorId) {
  const assigned = leads.filter((l) => l.agent_id);
  const unassigned = leads.filter((l) => !l.agent_id);
  // Round-robin across whatever assigned leads exist so this works on any DB.
  const pick = (i) => assigned[i % assigned.length];
  const rows = [];

  const push = (lead, o) =>
    rows.push({
      lead_id: lead.id,
      profile_id: lead.profile_id,
      organizer_id: o.organizer_id !== undefined ? o.organizer_id : lead.agent_id,
      source: "calcom",
      calcom_uid: SEED_PREFIX + o.key,
      calcom_status: o.calcom_status || "Booked",
      google_event_id: null,
      meet_link: "https://app.cal.com/video/" + o.key,
      title: o.title,
      description: o.description || null,
      start_time: new Date(o.start),
      end_time: new Date(o.end),
      status: o.status || "scheduled",
      status_synced: false,
      outcome: o.outcome || null,
      outcome_at: o.outcome_at || null,
      outcome_by: o.outcome_by || null,
      attendees: [
        {
          email: lead.Profile?.email || null,
          name: lead.Profile?.name || null,
          user_id: null,
          type: "lead",
        },
      ],
      attachments: [],
    });

  // The queue: ended, nobody has said what happened. The reason the feature exists.
  push(pick(0), {
    key: "needs-outcome-recent",
    title: "Mentor Call — ended 2h ago, awaiting verdict",
    start: now - 3 * HOUR,
    end: now - 2 * HOUR,
  });

  // Same, but old enough to trip needs_outcome_stale on the tile.
  push(pick(1), {
    key: "needs-outcome-stale",
    title: "Mentor Call — 10 days old, should read as stale",
    start: now - 10 * DAY - HOUR,
    end: now - 10 * DAY,
  });

  // The row that used to crash the list: no organizer at all. Only a Superadmin
  // should be able to log it, and only via the lead-visibility gate.
  if (unassigned.length) {
    push(unassigned[0], {
      key: "needs-outcome-unassigned",
      title: "Mentor Call — nobody assigned, Superadmin-only outcome",
      start: now - 4 * HOUR,
      end: now - 3 * HOUR,
      organizer_id: null,
    });
  }

  // Already settled by a human — should show the verdict, not just "ended".
  push(pick(0), {
    key: "done-attended",
    title: "Mentor Call — logged as attended",
    start: now - DAY - HOUR,
    end: now - DAY,
    outcome: "attended",
    outcome_at: new Date(now - DAY + 30 * MIN),
    outcome_by: actorId,
  });

  push(pick(1), {
    key: "upcoming",
    title: "Mentor Call — two days out",
    start: now + 2 * DAY,
    end: now + 2 * DAY + 30 * MIN,
    description: "Wants to discuss the PM Fellowship syllabus.",
  });

  // Started, not finished: must read as live, never as awaiting an outcome.
  push(pick(0), {
    key: "live",
    title: "Mentor Call — happening right now",
    start: now - 10 * MIN,
    end: now + 20 * MIN,
  });

  // Lead cancelled through the Cal.com link: Cal.com owns this fact, so it is
  // settled on arrival and must never ask for a verdict.
  push(pick(1), {
    key: "cancelled",
    title: "Mentor Call — lead cancelled via Cal.com",
    start: now + DAY,
    end: now + DAY + 30 * MIN,
    status: "cancelled",
    calcom_status: "Cancelled",
  });

  // The one Cal.com status the state badge can't express, so the only one that
  // should render a chip of its own.
  push(pick(0), {
    key: "rescheduled",
    title: "Mentor Call — moved by the lead",
    start: now + 3 * DAY,
    end: now + 3 * DAY + 30 * MIN,
    calcom_status: "Rescheduled",
  });

  return rows;
}

async function run() {
  const args = process.argv.slice(2);
  const clean = args.includes("--clean");
  const confirm = args.includes("--confirm");

  console.log(`target: ${targetHost()}`);
  if (!clean && !confirm) {
    console.error(
      "Refusing to seed without --confirm. Check the host above is not production.",
    );
    process.exit(1);
  }

  if (clean) {
    const n = await Meeting.destroy({
      where: { calcom_uid: { [Op.like]: `${SEED_PREFIX}%` } },
    });
    console.log(`removed ${n} seeded meetings`);
    process.exit(0);
  }

  const leads = await Lead.findAll({
    where: { product_id: "Calcom", is_deleted: false },
    include: [{ model: LeadProfile, as: "Profile", attributes: ["id", "name", "email"] }],
  });
  if (!leads.some((l) => l.agent_id)) {
    console.error(
      "No assigned Cal.com lead to hang seeds off. Assign an agent to one and retry.",
    );
    process.exit(1);
  }

  const actor = await User.findOne({ where: { role: "Superadmin" } });
  if (!actor) {
    console.error("No Superadmin found to attribute the logged outcome to.");
    process.exit(1);
  }

  // Re-seeding must not trip the partial unique index on calcom_uid.
  await Meeting.destroy({
    where: { calcom_uid: { [Op.like]: `${SEED_PREFIX}%` } },
  });

  const rows = plan(Date.now(), leads, actor.id);
  await Meeting.bulkCreate(rows);

  console.log(`seeded ${rows.length} Cal.com meetings:`);
  for (const r of rows) {
    console.log(
      `  ${r.calcom_uid.replace(SEED_PREFIX, "").padEnd(24)} ` +
        `${r.status.padEnd(9)} outcome=${String(r.outcome).padEnd(8)} ` +
        `organizer=${r.organizer_id ? "yes" : "NONE"}`,
    );
  }
  console.log("\nrun with --clean to remove them again");
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
