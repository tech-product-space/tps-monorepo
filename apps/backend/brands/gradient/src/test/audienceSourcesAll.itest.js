/**
 * Every audience source, resolved for real:
 *
 *   node src/test/audienceSourcesAll.itest.js
 *
 * The panel exposed four of the twelve resolvers for a long time, so eight of
 * them had never been reached from the UI at all. This asks each one, with the
 * filter shape the selector now writes, and reports what came back.
 *
 * The point is not the counts — those depend on whatever is in the database. It
 * is that **a source with a resolver never throws and never silently returns
 * nothing when it should have failed.** "Nobody matched" and "that source is
 * broken" must not look the same to whoever is staring at a preview of zero.
 */

import db from "../database/postgres/models/index.js";
import { buildRecipients } from "../services/campaign/buildRecipients.js";
import { CAMPAIGN_SOURCE_TYPE } from "../config/constants/campaign.js";
import { isSupportedSourceType } from "../services/campaign/recipientResolver/index.js";

let passed = 0;
let failed = 0;

const report = (name, ok, detail = "") => {
  if (ok) passed += 1;
  else failed += 1;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
};

/** The filter shape the selector writes for each source, at its widest. */
const CASES = [
  { type: CAMPAIGN_SOURCE_TYPE.LEADS, filters: {} },
  { type: CAMPAIGN_SOURCE_TYPE.RESOURCE_LEADS, filters: {} },
  { type: CAMPAIGN_SOURCE_TYPE.EVENT_GUESTS, filters: {} },
  { type: CAMPAIGN_SOURCE_TYPE.CONTACT_LISTS, filters: {} },
  { type: CAMPAIGN_SOURCE_TYPE.SUBSCRIBERS, filters: {} },
  { type: CAMPAIGN_SOURCE_TYPE.USERS, filters: {} },
  { type: CAMPAIGN_SOURCE_TYPE.USERS, filters: { emailVerified: true }, label: "users (verified only)" },
  { type: CAMPAIGN_SOURCE_TYPE.FREE_COURSE_ENROLMENTS, filters: {} },
  { type: CAMPAIGN_SOURCE_TYPE.FREE_COURSE_PROGRESS, filters: {} },
  {
    type: CAMPAIGN_SOURCE_TYPE.FREE_COURSE_PROGRESS,
    filters: { state: "inProgress" },
    label: "freeCourseProgress (started, not finished)",
  },
  { type: CAMPAIGN_SOURCE_TYPE.CERTIFICATE_HOLDERS, filters: {} },
  { type: CAMPAIGN_SOURCE_TYPE.EVENT_FEEDBACK, filters: {} },
  {
    type: CAMPAIGN_SOURCE_TYPE.EVENT_FEEDBACK,
    filters: { responded: false },
    label: "eventFeedback (asked, said nothing)",
  },
  { type: CAMPAIGN_SOURCE_TYPE.EVENT_REFERRERS, filters: { minReferrals: 1 } },
  { type: CAMPAIGN_SOURCE_TYPE.CAMPAIGN_RECIPIENTS, filters: {} },
];

console.log("\n── every source type has a resolver ──");

for (const type of Object.values(CAMPAIGN_SOURCE_TYPE)) {
  report(`${type} is supported`, isSupportedSourceType(type));
}

console.log("\n── each one resolves without throwing ──");

for (const testCase of CASES) {
  const name = testCase.label ?? testCase.type;

  try {
    const { recipients, stats } = await buildRecipients({
      include: [{ type: testCase.type, filters: testCase.filters }],
      exclude: [],
    });

    const source = stats?.include?.find((s) => s.type === testCase.type);

    report(
      name,
      Array.isArray(recipients),
      `${recipients.length} people, ${source?.rows ?? "?"} rows matched`,
    );
  } catch (error) {
    report(name, false, error.message);
  }
}

console.log("\n── an unknown source is a named error, not an empty audience ──");

try {
  await buildRecipients({
    include: [{ type: "somethingNobodyBuilt", filters: {} }],
    exclude: [],
  });
  report("an unresolvable source is refused", false, "it resolved quietly instead");
} catch (error) {
  report("an unresolvable source is refused", true, error.message);
}

console.log(`\n${passed} passed, ${failed} failed\n`);

await db.sequelize.close();
process.exit(failed ? 1 : 0);
