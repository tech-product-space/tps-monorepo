import db from "../../database/postgres/models/index.js";
import {
  EVENT_ATTENDEE_TYPE,
  EVENT_GUEST_STATUS,
} from "../../config/constants/eventGuest.js";
import { LEAD_STATUS } from "../../config/constants/lead.js";
import {
  EVENT_CERTIFICATE_SOURCE,
  EVENT_CERTIFICATE_STATUS,
} from "../../config/constants/eventCertificate.js";
import {
  CAMPAIGN_SOURCE_TYPE,
  FREE_COURSE_PROGRESS_STATE,
} from "../../config/constants/campaign.js";
import { SUBSCRIBER_SOURCE } from "../../config/constants/subscriber.js";
import { EMAIL_PROVIDER_ID } from "../../services/email/index.js";
import { SUPPORTED_SOURCE_TYPES } from "../../services/campaign/recipientResolver/index.js";
import { countUnemailableMetaLeads } from "../../services/campaign/recipientResolver/metaLeadResolver.js";
import { buildRecipients } from "../../services/campaign/buildRecipients.js";
import { findSuppressed } from "../../services/subscriber/suppression.service.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { getMeta, getPaginationParams } from "../../util/helpers/pagination.js";

const {
  Campaign,
  Event,
  Resource,
  FreeCourse,
  Contact,
  ContactList,
  Recording,
  RecordingCategory,
} = db;

/**
 * SENDER OPTIONS
 *
 * From `EMAIL_PROVIDER_ID`, so the panel cannot offer an address the mail layer
 * has no provider for. TPS hardcodes five strings in a React component and
 * validates none of them.
 */
export const listSenders = asyncWrapper(async (req, res) => {
  return res.json({
    data: Object.entries(EMAIL_PROVIDER_ID).map(([key, email]) => ({
      key,
      email,
    })),
  });
});

/**
 * AUDIENCE OPTIONS
 *
 * Everything the audience selector needs, in one request. TPS fires three on
 * open and another per filter step; this is one round trip because the dialog
 * is unusable until all of it has arrived anyway.
 *
 * Lead sources are **queried, not hardcoded** — the same `GET /leads/sources`
 * aggregation the leads page uses — so a new course or form appears here on its
 * own.
 */
export const listAudienceSources = asyncWrapper(async (req, res) => {
  const [
    leadSources,
    events,
    resources,
    freeCourses,
    campaigns,
    contactLists,
    recordings,
    recordingCategories,
  ] = await Promise.all([
      db.sequelize.query(
        `
        SELECT
          source,
          MAX("sourceDisplayName") as "sourceDisplayName",
          json_agg(
            DISTINCT jsonb_build_object(
              'subSource', "subSource",
              'subSourceDisplayName', "subSourceDisplayName"
            )
          ) FILTER (WHERE "subSource" IS NOT NULL) as "subSources"
        FROM leads
        GROUP BY source
        ORDER BY source;
        `,
        { type: db.sequelize.QueryTypes.SELECT },
      ),

      Event.findAll({
        attributes: ["id", "eventTitle", "eventStartDate"],
        order: [["eventStartDate", "DESC"]],
        raw: true,
      }),

      Resource.findAll({
        attributes: [
          "id",
          "title",
          "resourceType",
          "resourceCategory",
          "tagPrimary",
          "tagSecondary",
        ],
        order: [["createdAt", "DESC"]],
        raw: true,
      }),

      FreeCourse.findAll({
        attributes: ["id", "title"],
        order: [["createdAt", "DESC"]],
        raw: true,
      }),

      // For the exclude side: "everyone who already got that one".
      Campaign.findAll({
        attributes: ["id", "name", "status", "sentAt"],
        order: [["createdAt", "DESC"]],
        limit: 50,
        raw: true,
      }),

      // Sizes come with the names: picking a list without knowing whether it
      // holds 30 people or 30,000 is not a decision anyone can make.
      ContactList.findAll({
        attributes: ["id", "name"],
        order: [["createdAt", "DESC"]],
        raw: true,
      }),

      Recording.findAll({
        attributes: ["id", "title", "categoryId"],
        order: [["createdAt", "DESC"]],
        raw: true,
      }),

      RecordingCategory.findAll({
        attributes: ["id", "name"],
        order: [["name", "ASC"]],
        raw: true,
      }),
    ]);

  const contactCounts = contactLists.length
    ? await Contact.findAll({
        attributes: [
          "contactListId",
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
        ],
        group: ["contactListId"],
        raw: true,
      })
    : [];

  const contactCountByList = Object.fromEntries(
    contactCounts.map((c) => [c.contactListId, Number(c.count)]),
  );

  // Guest and download counts, so the pickers say how big each event and
  // resource actually is. Picking a source blind — "March workshop" with no
  // idea whether that is 40 people or 4,000 — is not a decision anyone can
  // make. Two grouped queries, not one per row.
  const [guestCounts, resourceLeadCounts, recordingLeadCounts] =
    await Promise.all([
    db.sequelize.query(
      `
      SELECT "eventId", status, COUNT(*)::int AS count
      FROM "EventGuests"
      WHERE email IS NOT NULL
      GROUP BY "eventId", status;
      `,
      { type: db.sequelize.QueryTypes.SELECT },
    ),
    db.sequelize.query(
      `
      SELECT "resourceId",
             COUNT(*)::int                      AS downloads,
             COUNT(DISTINCT lower(email))::int  AS people
      FROM "ResourceLeads"
      WHERE email IS NOT NULL
      GROUP BY "resourceId";
      `,
      { type: db.sequelize.QueryTypes.SELECT },
    ),
    // One row per (recording, email) by construction, so this count is people
    // — no DISTINCT needed, unlike ResourceLeads above.
    db.sequelize.query(
      `
      SELECT "recordingId", COUNT(*)::int AS people
      FROM "RecordingLeads"
      WHERE email IS NOT NULL
      GROUP BY "recordingId";
      `,
      { type: db.sequelize.QueryTypes.SELECT },
    ),
  ]);

  const guestStats = {};

  for (const row of guestCounts) {
    const stat = (guestStats[row.eventId] ??= { total: 0, byStatus: {} });
    stat.total += row.count;
    stat.byStatus[row.status] = row.count;
  }

  const recordingPeople = Object.fromEntries(
    recordingLeadCounts.map((r) => [r.recordingId, r.people]),
  );

  const resourceStats = Object.fromEntries(
    resourceLeadCounts.map((r) => [
      r.resourceId,
      { downloads: r.downloads, people: r.people },
    ]),
  );

  // Distinct filter values, derived rather than listed, so they cannot drift
  // from what is actually in the data.
  const distinct = (rows, key) =>
    [...new Set(rows.map((r) => r[key]).filter(Boolean))].sort();

  const tags = [
    ...new Set(
      resources.flatMap((r) => [
        ...(r.tagPrimary || []),
        ...(r.tagSecondary || []),
      ]),
    ),
  ]
    .filter(Boolean)
    .sort();

  const [jobTitles] = await db.sequelize.query(
    `SELECT DISTINCT "jobTitle" FROM "ResourceLeads" WHERE "jobTitle" IS NOT NULL AND "jobTitle" <> '' ORDER BY "jobTitle";`,
  );

  return res.json({
    data: {
      supportedSourceTypes: SUPPORTED_SOURCE_TYPES,

      leads: {
        sources: leadSources,
        statuses: Object.values(LEAD_STATUS),
      },

      resources: {
        items: resources.map(({ id, title, resourceType, resourceCategory }) => ({
          id,
          title,
          resourceType,
          resourceCategory,
          // Downloads are rows, people are unique addresses — they differ a
          // lot here, because nothing dedupes at capture.
          downloads: resourceStats[id]?.downloads || 0,
          people: resourceStats[id]?.people || 0,
        })),
        types: distinct(resources, "resourceType"),
        categories: distinct(resources, "resourceCategory"),
        tags,
        jobTitles: jobTitles.map((r) => r.jobTitle),
      },

      events: {
        items: events.map((event) => ({
          ...event,
          totalGuests: guestStats[event.id]?.total || 0,
          guestsByStatus: guestStats[event.id]?.byStatus || {},
        })),
        statuses: Object.values(EVENT_GUEST_STATUS),
        attendeeTypes: Object.values(EVENT_ATTENDEE_TYPE),
      },

      freeCourses: { items: freeCourses },

      // The recordings library. `categories` is the whole catalogue rather
      // than the categories in use, because the resolver filters on
      // `categoryId` and an admin should be able to pick one that is empty
      // today and will not be next week.
      recordings: {
        items: recordings.map((recording) => ({
          ...recording,
          people: recordingPeople[recording.id] || 0,
        })),
        categories: recordingCategories,
      },

      subscribers: { sources: Object.values(SUBSCRIBER_SOURCE) },

      campaigns: { items: campaigns },

      contactLists: {
        items: contactLists.map((list) => ({
          ...list,
          contactCount: contactCountByList[list.id] || 0,
        })),
      },

      // Phase 6. The event and free-course pickers reuse `events.items` and
      // `freeCourses.items` above — only the vocabularies unique to these
      // sources need shipping.
      certificates: {
        statuses: Object.values(EVENT_CERTIFICATE_STATUS),
        sources: Object.values(EVENT_CERTIFICATE_SOURCE),
      },

      freeCourseProgress: {
        states: Object.values(FREE_COURSE_PROGRESS_STATE),
      },
    },
  });
});

/**
 * How many people the include side matched that have no email address at all.
 *
 * Only Facebook can produce them: a lead ad form very often collects a phone
 * number and nothing else, so the same filters can read "2,000 leads" on the
 * Meta Leads screen and "1,340 recipients" here. Every other source is keyed on
 * an address by construction.
 *
 * Reported as its own number rather than folded into the gap, because
 * "suppressed" and "never had an address" are different facts and an operator
 * who cannot tell them apart assumes the preview is broken. Exclude clauses are
 * not counted — a row with no email was never going to be mailed, so removing
 * it removes nothing.
 */
const countUnemailableIncluded = async (recipientFilters) => {
  const include = recipientFilters?.include ?? recipientFilters?.sources ?? [];

  if (!Array.isArray(include)) return 0;

  const counts = await Promise.all(
    include
      .filter((clause) => clause?.type === CAMPAIGN_SOURCE_TYPE.META_LEADS)
      .map((clause) => countUnemailableMetaLeads(clause.filters || {})),
  );

  return counts.reduce((total, n) => total + n, 0);
};

/**
 * PREVIEW RECIPIENTS
 *
 * Resolves the audience for real and answers two different questions:
 *
 *   - the numbers, which is what someone reads before committing to a send
 *   - a page of actual people, which is how you sanity-check the numbers
 *
 * Paginated server-side. TPS returns every recipient and lets the browser call
 * `.slice()` on it, which ships tens of thousands of rows to render ten.
 */
export const previewRecipients = asyncWrapper(async (req, res) => {
  const campaign = await Campaign.findByPk(req.params.id);

  if (!campaign) {
    return res.status(404).json({ message: "Campaign not found" });
  }

  let built;

  try {
    built = await buildRecipients(campaign.recipientFilters);
  } catch (err) {
    // A bad source type is the admin's mistake, not a server fault, and the
    // message names the offending source.
    return res.status(400).json({ message: err.message });
  }

  const { recipients, stats } = built;

  // The same suppression check the send job runs, so the preview's number is
  // the number that will actually be mailed rather than an optimistic one.
  const suppressed = await findSuppressed(recipients.map((r) => r.email));

  const mailable = recipients.filter((r) => !suppressed.has(r.email));

  const unemailable = await countUnemailableIncluded(campaign.recipientFilters);

  const { page, limit, offset } = getPaginationParams(req.query);
  const pageRows = mailable.slice(offset, offset + limit);

  return res.json({
    data: {
      campaign: {
        id: campaign.id,
        name: campaign.name,
        subject: campaign.subject,
        senderEmail: campaign.senderEmail,
        senderName: campaign.senderName,
        status: campaign.status,
      },

      // `rows` are records matched, `unique` are people contributed. They are
      // not the same number — resource leads have no capture-time dedupe — and
      // showing only the first would overstate the audience.
      breakdown: {
        include: stats.include,
        exclude: stats.exclude,
      },

      totals: {
        rowsMatched: stats.totalRows,
        uniquePeople: stats.uniqueBeforeExclude,
        excluded: stats.excluded,
        suppressed: recipients.length - mailable.length,
        mailable: mailable.length,
        // Matched the filters and cannot be mailed at all — see
        // `countUnemailableIncluded`.
        unemailable,
      },

      recipients: pageRows,
    },

    meta: getMeta(mailable.length, page, limit),
  });
});
