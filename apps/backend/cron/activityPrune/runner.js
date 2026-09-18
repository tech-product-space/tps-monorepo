"use strict";

const { pruneAnonymousActivity } = require("../../service/visitorActivity/claim");

/**
 * Clears out anonymous browsing nobody ever claimed.
 *
 * About four visitors in five never submit a form, so most of what the site
 * records can never be attributed to anyone. Without this the table grows
 * forever with page views that will never be read.
 *
 * Only ever deletes rows with no phone. History that belongs to a person is
 * never touched here — if that ever needs a retention policy it is a separate,
 * deliberate decision, not a side effect of tidying up.
 *
 * A month is the default: long enough to cover a slow decision (someone who
 * reads the fellowship pages in June and enrols in July still arrives with
 * their history), short enough that the table stays honest.
 */
const RETENTION_DAYS = parseInt(
  process.env.ACTIVITY_ANON_RETENTION_DAYS || "30",
  10,
);

async function runActivityPrune() {
  try {
    const deleted = await pruneAnonymousActivity(RETENTION_DAYS);
    if (deleted) {
      console.log(
        `🧹 Activity prune: removed ${deleted} unclaimed page views older than ${RETENTION_DAYS} days`,
      );
    }
  } catch (err) {
    console.error("Activity prune failed:", err.message);
  }
}

module.exports = { runActivityPrune, RETENTION_DAYS };
