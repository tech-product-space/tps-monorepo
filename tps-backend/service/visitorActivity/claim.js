"use strict";

const sequelize = require("../../config/db");
const { VisitorActivity } = require("../../models");
const { enqueueCrmSync } = require("../../queues/activityQueues");

/**
 * Turns a browser's anonymous browsing into a named person's history.
 *
 * Most people read the site before they tell you who they are — only about one
 * visitor in five ever submits a form. Those earlier page views are recorded
 * against the browser alone, with no phone, and they stay in TPS: they are not
 * sent to the CRM, because there is nobody there to attach them to.
 *
 * The moment a form arrives we know which phone that browser belongs to. This
 * stamps it onto everything the browser did beforehand and releases the rows to
 * the CRM, where they land as an ordinary trail — one that now starts weeks
 * before the form rather than at it.
 *
 * Two details that are easy to get wrong:
 *
 * 1. `phone IS NULL` guards the update. Rows already claimed by an earlier
 *    contact keep the number they had. Someone who submits a second phone gets
 *    a second person from that point on, and their earlier history stays with
 *    who they were at the time — see WEBSITE_ACTIVITY_PLAN.md §4.4.
 *
 * 2. Anonymous rows must never have been sent to the CRM. The CRM writes them
 *    with ON CONFLICT DO NOTHING keyed on this id, so a row delivered without a
 *    phone could never be corrected afterwards — the second delivery would be
 *    silently discarded. Holding them here until they are identified is what
 *    makes this work at all.
 */

/**
 * @param {string} visitorId
 * @param {{name?: string, email?: string, phone?: string}} contact
 * @returns {Promise<number>} how many page views were claimed
 */
async function claimAnonymousActivity(visitorId, contact) {
  if (!visitorId || !contact?.phone) return 0;

  const [rows] = await sequelize.query(
    `UPDATE "VisitorActivity"
        SET phone = :phone,
            name  = COALESCE(:name, name),
            email = COALESCE(:email, email),
            "crmSyncedAt" = NULL
      WHERE "visitorId" = :visitorId
        AND phone IS NULL
      RETURNING id`,
    {
      replacements: {
        visitorId,
        phone: contact.phone,
        name: contact.name || null,
        email: contact.email || null,
      },
    },
  );

  if (!rows.length) return 0;

  // Ship them now rather than waiting up to an hour for the sweep. Someone who
  // has just filled in a form is the person an agent is most likely to open in
  // the next few minutes.
  await enqueueCrmSync(rows.map((r) => r.id));

  return rows.length;
}

/** Fire-and-forget: a form submission must never fail because of this. */
function claimAnonymousActivityInBackground(visitorId, contact) {
  claimAnonymousActivity(visitorId, contact)
    .then((n) => {
      if (n) console.log(`[activity] claimed ${n} earlier page views for ${visitorId}`);
    })
    .catch((err) => {
      // The rows keep phone IS NULL, so a later contact from the same browser
      // will claim them instead. Nothing is lost, only delayed.
      console.error("[activity] claim failed:", err.message);
    });
}

/**
 * Deletes anonymous page views nobody ever claimed.
 *
 * Four visitors in five never submit a form, so without this the table grows
 * forever with browsing that can never be attributed to anyone. A month is long
 * enough to cover a slow decision and short enough to keep the table honest.
 *
 * Only ever touches rows with no phone. Identified history is never pruned here.
 */
async function pruneAnonymousActivity(days) {
  const [rows] = await sequelize.query(
    `DELETE FROM "VisitorActivity"
      WHERE phone IS NULL
        AND "occurredAt" < now() - (:days || ' days')::interval
      RETURNING id`,
    { replacements: { days: String(days) } },
  );
  return rows.length;
}

module.exports = {
  claimAnonymousActivity,
  claimAnonymousActivityInBackground,
  pruneAnonymousActivity,
};
