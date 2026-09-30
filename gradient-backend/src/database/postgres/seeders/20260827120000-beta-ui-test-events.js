"use strict";

import { ulid } from "ulid";

/**
 * Filler events for the /events listing's progressive reveal, which cannot be
 * exercised on beta's real data — the public endpoint only returns published
 * events that have not ended yet, and there is currently one of those.
 *
 * 20 is chosen to walk the reveal through every state it has: 6 shown, then
 * 12, then 18 with a full three-card teaser each time, then a final click that
 * lands on 20 with a two-card teaser and no button left.
 *
 * Rows are cloned from a real published event so the cards carry a genuine
 * creative, speaker and time — a hand-written row renders a card full of
 * fallbacks and proves nothing about the layout.
 *
 * TEST DATA. Remove with `npm run pg:seed:undo` before this reaches anything
 * customer-facing; `down` deletes strictly by the slug prefix below, so it
 * cannot touch a real event.
 */
const SLUG_PREFIX = "beta-ui-test-event-";
const COUNT = 20;

/** `YYYY-MM-DD`, matching how every existing row stores its dates. */
const addDays = (days) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export default {
  async up(queryInterface) {
    const { sequelize } = queryInterface;

    // Prefer a source with speakers and times filled in: those drive the two
    // card rows the design leans on, and an empty one renders a blank footer.
    const [sources] = await sequelize.query(`
      SELECT * FROM "Events"
      WHERE "isPublished" = true
      ORDER BY (jsonb_array_length(COALESCE("speakers", '[]'::jsonb)) > 0) DESC,
               ("eventStartTime" IS NOT NULL AND "eventStartTime" <> '') DESC,
               "createdAt" DESC
      LIMIT 1
    `);

    const source = sources[0];

    if (!source) {
      console.warn("[beta-ui-test-events] no published event to clone — skipped");
      return;
    }

    // config.js sets no `seederStorage`, so `pg:seed:all` re-runs this file
    // every time. Skip what is already there rather than colliding on the
    // unique slug.
    const [existing] = await sequelize.query(
      `SELECT "eventSlug" FROM "Events" WHERE "eventSlug" LIKE :prefix`,
      { replacements: { prefix: `${SLUG_PREFIX}%` } },
    );
    const known = new Set(existing.map((row) => row.eventSlug));

    const now = new Date();
    const rows = [];

    for (let n = 1; n <= COUNT; n += 1) {
      const suffix = String(n).padStart(2, "0");
      const slug = `${SLUG_PREFIX}${suffix}`;

      if (known.has(slug)) continue;

      // Spread a day apart so the listing's sort by start date puts them in a
      // predictable, checkable order.
      const date = addDays(n);

      rows.push({
        id: ulid(),
        eventTitle: `Beta Test Event ${suffix}`,
        eventSubtitle: source.eventSubtitle,
        eventStartDate: date,
        eventEndDate: date,
        eventStartTime: source.eventStartTime || "10:00",
        eventEndTime: source.eventEndTime || "11:30",
        // jsonb columns go in as text: node-postgres turns a JS array into a
        // Postgres array literal, not JSON, which a jsonb column rejects.
        speakers: JSON.stringify(source.speakers ?? []),
        numberOfAttendees: source.numberOfAttendees,
        eventCreativeUrl: source.eventCreativeUrl,
        isPublished: true,
        eventType: source.eventType,
        eventCategory: source.eventCategory,
        ctaType: source.ctaType,
        location: source.location,
        locationType: source.locationType,
        tags: source.tags ?? [],
        eventDetails: JSON.stringify(source.eventDetails ?? {}),
        seo: JSON.stringify(source.seo ?? {}),
        eventSlug: slug,
        canAcceptResponse: source.canAcceptResponse ?? false,
        scheduledAt: null,
        settings: JSON.stringify(source.settings ?? {}),
        createdAt: now,
        updatedAt: now,
      });
    }

    if (rows.length) {
      await queryInterface.bulkInsert("Events", rows);
    }
  },

  async down(queryInterface) {
    const { Op } = await import("sequelize");

    await queryInterface.bulkDelete("Events", {
      eventSlug: { [Op.like]: `${SLUG_PREFIX}%` },
    });
  },
};
