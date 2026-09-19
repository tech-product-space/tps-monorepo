/**
 * Move every Approved guest of one event back to Waitlisted.
 *
 * Dry run is the default — nothing is written unless you pass --confirm.
 * No email is sent, ever: this is a correction, and the Waitlisted template
 * would tell guests they had been un-approved.
 *
 *   node src/scripts/reset-approved-guests-to-waitlist.js --list
 *   node src/scripts/reset-approved-guests-to-waitlist.js --title="product analytics"
 *   node src/scripts/reset-approved-guests-to-waitlist.js --event=01J...
 *   node src/scripts/reset-approved-guests-to-waitlist.js --event=01J... --confirm
 *
 * Flags:
 *   --list                 list events (id, title, date, approved/waitlisted counts) and exit
 *   --event=<id>           the event to reset
 *   --title=<substring>    pick the event by title instead; must match exactly one
 *   --attendeeType=<type>  optional, Student | Professional — restrict to one type
 *   --confirm              actually perform the update
 */

import { Op } from "sequelize";
import db from "../database/postgres/models/index.js";
import {
  EVENT_ATTENDEE_TYPE,
  EVENT_GUEST_STATUS,
} from "../config/constants/eventGuest.js";

const { Event, EventGuest, sequelize } = db;

const arg = (name) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3).replace(/^["']|["']$/g, "") : null;
};
const flag = (name) => process.argv.includes(`--${name}`);

const CONFIRM = flag("confirm");
const LIST = flag("list");
const EVENT_ID = arg("event");
const TITLE = arg("title");
const ATTENDEE_TYPE = arg("attendeeType");

async function statusCounts(eventId) {
  const rows = await EventGuest.findAll({
    where: { eventId },
    attributes: [
      "status",
      [sequelize.fn("COUNT", sequelize.col("id")), "count"],
    ],
    group: ["status"],
    raw: true,
  });
  return rows.reduce((acc, r) => ({ ...acc, [r.status]: Number(r.count) }), {});
}

async function listEvents() {
  const events = await Event.findAll({
    attributes: ["id", "eventTitle", "eventStartDate", "isPublished"],
    order: [["createdAt", "DESC"]],
  });

  if (!events.length) {
    console.log("No events found.");
    return;
  }

  console.log(`\n${events.length} event(s), newest first:\n`);
  for (const e of events) {
    const counts = await statusCounts(e.id);
    const approved = counts[EVENT_GUEST_STATUS.APPROVED] ?? 0;
    const waitlisted = counts[EVENT_GUEST_STATUS.WAITLISTED] ?? 0;
    const declined = counts[EVENT_GUEST_STATUS.DECLINED] ?? 0;
    console.log(
      `  ${e.id}  ${e.eventStartDate ?? "no date"}  ${
        e.isPublished ? "published" : "draft    "
      }  approved=${approved} waitlisted=${waitlisted} declined=${declined}  ${
        e.eventTitle ?? "(untitled)"
      }`,
    );
  }
  console.log(
    `\nRe-run with --event=<id> to preview the reset for one of these.\n`,
  );
}

async function resolveEvent() {
  if (EVENT_ID) {
    const event = await Event.findByPk(EVENT_ID);
    if (!event) throw new Error(`No event with id ${EVENT_ID}`);
    return event;
  }

  const matches = await Event.findAll({
    where: { eventTitle: { [Op.iLike]: `%${TITLE}%` } },
    order: [["createdAt", "DESC"]],
  });

  if (!matches.length) throw new Error(`No event title matches "${TITLE}"`);
  if (matches.length > 1) {
    console.log(`"${TITLE}" matches ${matches.length} events:`);
    matches.forEach((e) => console.log(`  ${e.id}  ${e.eventTitle}`));
    throw new Error("Ambiguous --title. Re-run with --event=<id>.");
  }
  return matches[0];
}

async function main() {
  if (LIST) return listEvents();

  if (!EVENT_ID && !TITLE) {
    console.log(
      "Pick an event: --event=<id> or --title=<substring>. Use --list to see them.",
    );
    process.exitCode = 1;
    return;
  }

  if (
    ATTENDEE_TYPE &&
    !Object.values(EVENT_ATTENDEE_TYPE).includes(ATTENDEE_TYPE)
  ) {
    throw new Error(
      `Invalid --attendeeType "${ATTENDEE_TYPE}". Use one of: ${Object.values(
        EVENT_ATTENDEE_TYPE,
      ).join(", ")}`,
    );
  }

  const event = await resolveEvent();
  const where = { eventId: event.id, status: EVENT_GUEST_STATUS.APPROVED };
  if (ATTENDEE_TYPE) where.attendeeType = ATTENDEE_TYPE;

  const before = await statusCounts(event.id);

  console.log(`\nEvent : ${event.eventTitle ?? "(untitled)"}`);
  console.log(`Id    : ${event.id}`);
  console.log(`Date  : ${event.eventStartDate ?? "-"}`);
  console.log(
    `Guests: approved=${before[EVENT_GUEST_STATUS.APPROVED] ?? 0} ` +
      `waitlisted=${before[EVENT_GUEST_STATUS.WAITLISTED] ?? 0} ` +
      `declined=${before[EVENT_GUEST_STATUS.DECLINED] ?? 0}`,
  );
  if (ATTENDEE_TYPE) console.log(`Filter: attendeeType=${ATTENDEE_TYPE}`);

  const guests = await EventGuest.findAll({
    where,
    attributes: ["id", "name", "email", "attendeeType"],
    order: [["createdAt", "ASC"]],
  });

  console.log(`\nWould move ${guests.length} guest(s) Approved -> Waitlisted.`);

  if (!guests.length) {
    console.log("Nothing to do.");
    return;
  }

  const preview = guests.slice(0, 10);
  preview.forEach((g) =>
    console.log(
      `  ${g.name} <${g.email ?? "no email"}> (${g.attendeeType})`,
    ),
  );
  if (guests.length > preview.length) {
    console.log(`  ... and ${guests.length - preview.length} more`);
  }

  if (!CONFIRM) {
    console.log("\nDRY RUN — nothing changed. Re-run with --confirm to apply.");
    return;
  }

  const [affected] = await EventGuest.update(
    {
      status: EVENT_GUEST_STATUS.WAITLISTED,
      statusUpdatedBy: null,
      statusUpdatedAt: new Date(),
    },
    { where },
  );

  const after = await statusCounts(event.id);
  console.log(
    `\n✅ Moved ${affected ?? guests.length} guest(s) back to Waitlisted. ` +
      `No email was sent.`,
  );
  console.log(
    `Now  : approved=${after[EVENT_GUEST_STATUS.APPROVED] ?? 0} ` +
      `waitlisted=${after[EVENT_GUEST_STATUS.WAITLISTED] ?? 0} ` +
      `declined=${after[EVENT_GUEST_STATUS.DECLINED] ?? 0}`,
  );
}

main()
  .catch((e) => {
    console.error("ERROR:", e.message);
    process.exitCode = 1;
  })
  .finally(() => sequelize.close());
