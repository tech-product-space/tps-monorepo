import db from "../../../database/postgres/models/index.js";
import { CAMPAIGN_SOURCE_TYPE } from "../../../config/constants/campaign.js";
import {
  META_IMPORT_SOURCE,
  META_LEAD_STATUS,
} from "../../../config/constants/metaLead.js";
import logger from "../../../util/logger.js";

/**
 * How old a Facebook lead may be and still start a journey.
 *
 * **This is a guard against mailing history, and it is not optional.** A
 * Facebook lead has two timestamps: `sourceCreatedAt` is when the person filled
 * the form, `createdAt` is when we imported the row. On a backfill they differ
 * by years — `docs/facebook-lead-integration.md` describes importing years of
 * leads in one afternoon — so a trigger keyed on "a row appeared" would send a
 * "thanks for enquiring" email to every person who ever filled that form.
 *
 * `importedVia` already rules out the backfill path exactly. This is the
 * backstop for the other version of the same mistake: a poller that has been
 * down for a week comes back, imports a week of genuinely-new leads as `poll`,
 * and mails all of them at once. Six hours is long enough to ride out a normal
 * outage and short enough that nobody receives a welcome for something they did
 * last Tuesday.
 */
const MAX_META_LEAD_AGE_MS = 6 * 60 * 60 * 1000;

/**
 * Turns "a row landed in table X" into a person, and answers whether a given
 * trigger filter matches it.
 *
 * One case per realtime source (§5.1). Six of them, and they are the six that
 * *start* a relationship — feedback, certificates, lesson completion and
 * newsletter signup are recorded as `lead_events` for branch conditions but
 * deliberately do not begin a journey, because each happens to somebody who is
 * usually already mid-journey.
 *
 * Facebook lead ads are the sixth, and the only one that needed guarding: every
 * other source is created once, live, by the person themselves, while a
 * `meta_leads` row can also arrive from a backfill of years of history.
 */

/**
 * Normalises a source row to `{ email, name, phone, sourceType, sourceId, raw }`.
 *
 * Returns null when there is nothing to enrol — no row, or a row with no
 * address. Neither is an error: an anonymous download is a real thing.
 */
export const loadTriggerSubject = async (sourceType, sourceId) => {
  const {
    Lead,
    EventGuest,
    ResourceLead,
    RecordingLead,
    ProjectLead,
    FreeCourseEnrollment,
    MetaLead,
    User,
  } = db;

  try {
    switch (sourceType) {
      case CAMPAIGN_SOURCE_TYPE.LEADS: {
        const row = await Lead.findByPk(sourceId);
        if (!row?.email) return null;

        return {
          email: row.email,
          name: row.name,
          phone: row.phone,
          sourceType,
          sourceId,
          raw: row,
        };
      }

      case CAMPAIGN_SOURCE_TYPE.EVENT_GUESTS: {
        const row = await EventGuest.findByPk(sourceId);
        if (!row?.email) return null;

        return {
          email: row.email,
          name: row.name,
          phone: row.phone,
          sourceType,
          sourceId,
          raw: row,
        };
      }

      case CAMPAIGN_SOURCE_TYPE.RESOURCE_LEADS: {
        const row = await ResourceLead.findByPk(sourceId);
        if (!row?.email) return null;

        return {
          email: row.email,
          name: row.name,
          phone: row.phone,
          sourceType,
          sourceId,
          raw: row,
        };
      }

      case CAMPAIGN_SOURCE_TYPE.RECORDING_LEADS: {
        const row = await RecordingLead.findByPk(sourceId);
        if (!row?.email) return null;

        /**
         * No history guard here, unlike metaLeads. This row can only be created
         * by somebody typing their address into the gate on a live page — there
         * is no import path and no backfill, so "a row appeared" and "a person
         * just did this" are the same statement.
         *
         * A repeat gate pass updates the existing row rather than inserting, so
         * the hook never fires twice and nobody is enrolled again for opening a
         * recording on a second device.
         */
        return {
          email: row.email,
          name: row.name,
          phone: row.phone,
          sourceType,
          sourceId,
          raw: row,
        };
      }

      case CAMPAIGN_SOURCE_TYPE.PROJECT_LEADS: {
        const row = await ProjectLead.findByPk(sourceId);
        if (!row?.email) return null;

        /**
         * No history guard here, for the same reason as recordingLeads: this
         * row can only be created by somebody typing their details into the
         * gate on a live page. There is no import path and no backfill, so "a
         * row appeared" and "a person just did this" are the same statement.
         *
         * A repeat gate pass updates the existing row rather than inserting, so
         * the hook never fires twice and nobody is enrolled again for grabbing
         * the same project on a second device.
         */
        return {
          email: row.email,
          name: row.name,
          phone: row.phone,
          sourceType,
          sourceId,
          raw: row,
        };
      }

      case CAMPAIGN_SOURCE_TYPE.FREE_COURSE_ENROLMENTS: {
        // Carries no email of its own; the address is on the account.
        const row = await FreeCourseEnrollment.findByPk(sourceId);
        if (!row) return null;

        const user = await User.findByPk(row.userId, {
          // `fullName`, not `name`. The column is `full_name` and the attribute
          // is `fullName`; `users.name` does not exist, so the fallback here
          // was silently dead.
          attributes: ["id", "email", "fullName"],
        });

        if (!user?.email) return null;

        return {
          email: user.email,
          name: row.name || user.fullName || null,
          phone: row.phone,
          sourceType,
          sourceId,
          raw: row,
        };
      }

      case CAMPAIGN_SOURCE_TYPE.META_LEADS: {
        const row = await MetaLead.findByPk(sourceId);
        if (!row?.email) return null;

        /**
         * A `skipped` row is one Facebook sent with no email and no phone. It
         * is kept deliberately — it is real ad spend — but there is nobody to
         * mail, so it starts nothing. Checked as well as the email above,
         * because the two can drift: an address may be edited in later.
         */
        if (row.status === META_LEAD_STATUS.SKIPPED) {
          logger.info("Meta lead is skipped, not enrolling", { sourceId });
          return null;
        }

        /* ── the two history guards, see MAX_META_LEAD_AGE_MS ── */

        if (row.importedVia === META_IMPORT_SOURCE.BACKFILL) {
          logger.info("Meta lead came from a backfill, not enrolling", {
            sourceId,
            formId: row.formId,
          });
          return null;
        }

        const filledAt = row.sourceCreatedAt ?? row.createdAt;
        const age = Date.now() - new Date(filledAt).getTime();

        if (age > MAX_META_LEAD_AGE_MS) {
          logger.warn("Meta lead is too old to start a journey", {
            sourceId,
            formId: row.formId,
            filledAt,
            hoursOld: Math.round(age / 3_600_000),
          });
          return null;
        }

        return {
          email: row.email,
          name: row.name,
          phone: row.phone,
          sourceType,
          sourceId,
          raw: row,
        };
      }

      case CAMPAIGN_SOURCE_TYPE.USERS: {
        const row = await User.findByPk(sourceId);
        if (!row?.email) return null;

        return {
          email: row.email,
          /**
           * `fullName`, not `name`.
           *
           * The `users` table calls it `full_name` and every campaign resolver
           * that touches it says so in a comment. This read `row.name`, which
           * does not exist — so anybody enrolled by creating an account got a
           * null name, and the first email said "Hi ,". Nothing errored,
           * because `undefined` is a perfectly good value to store.
           */
          name: row.fullName ?? null,
          phone: row.phone ?? null,
          sourceType,
          sourceId,
          raw: row,
        };
      }

      default:
        // A source the evaluator was asked to load and cannot. Named rather
        // than treated as "nobody matched" — the two must not look the same.
        logger.warn("Trigger source cannot be loaded", { sourceType, sourceId });
        return null;
    }
  } catch (error) {
    logger.error("Failed to load trigger subject", {
      sourceType,
      sourceId,
      error: error.message,
    });
    return null;
  }
};

/** `["a"]` / `"a"` / undefined → a set, or null for "no filter, match all". */
const asSet = (value) => {
  if (value === undefined || value === null) return null;

  const list = Array.isArray(value) ? value : [value];
  const clean = list.filter((v) => v !== undefined && v !== null && v !== "");

  return clean.length ? new Set(clean.map(String)) : null;
};

/**
 * Does this row match one trigger source clause?
 *
 * **An absent filter matches everything; an empty one also matches everything.**
 * TPS distinguishes the two — `{}` matches all but `{ eventFilters: {} }`
 * matches none — which its own README lists as a gotcha, because the difference
 * is invisible in the UI and silently produces a workflow that never fires.
 * One rule here: if you did not narrow it, it matches.
 */
export const matchesTriggerSource = (subject, clause) => {
  if (!clause?.type || clause.type !== subject.sourceType) return false;

  const filters = clause.filters ?? {};
  const row = subject.raw;

  switch (subject.sourceType) {
    case CAMPAIGN_SOURCE_TYPE.LEADS: {
      const sources = asSet(filters.source);
      const subSources = asSet(filters.subSource);

      if (sources && !sources.has(String(row.source))) return false;
      // Sub-sources narrow within a source, exactly as `LeadFilters` in the
      // panel encodes them.
      if (subSources && !subSources.has(String(row.subSource))) return false;

      return true;
    }

    case CAMPAIGN_SOURCE_TYPE.EVENT_GUESTS: {
      const eventIds = asSet(filters.eventIds ?? filters.eventId);
      const statuses = asSet(filters.status);
      const attendeeTypes = asSet(filters.attendeeType);

      if (eventIds && !eventIds.has(String(row.eventId))) return false;
      if (statuses && !statuses.has(String(row.status))) return false;
      if (attendeeTypes && !attendeeTypes.has(String(row.attendeeType))) {
        return false;
      }

      return true;
    }

    case CAMPAIGN_SOURCE_TYPE.RESOURCE_LEADS: {
      const resourceIds = asSet(filters.resourceIds ?? filters.resourceId);

      if (resourceIds && !resourceIds.has(String(row.resourceId))) return false;

      return true;
    }

    case CAMPAIGN_SOURCE_TYPE.RECORDING_LEADS: {
      const recordingIds = asSet(filters.recordingIds ?? filters.recordingId);

      if (recordingIds && !recordingIds.has(String(row.recordingId))) {
        return false;
      }

      /**
       * Narrowed by recording only, not by category. The row carries
       * `recordingId` and nothing else about the recording, so a category
       * filter would need a lookup on a hot path — and a trigger that has to
       * query to decide whether to fire is a trigger that fires late. Campaign
       * audiences filter by category; those run offline against a join.
       */
      return true;
    }

    case CAMPAIGN_SOURCE_TYPE.PROJECT_LEADS: {
      const projectIds = asSet(filters.projectIds ?? filters.projectId);

      if (projectIds && !projectIds.has(String(row.projectId))) return false;

      /**
       * Narrowed by project only, not by category or level. The row carries
       * `projectId` and nothing else about the project, so either of those
       * would need a lookup on a hot path — and a trigger that has to query to
       * decide whether to fire is a trigger that fires late. Campaign
       * audiences filter by category and level; those run offline against a
       * join.
       */
      return true;
    }

    case CAMPAIGN_SOURCE_TYPE.FREE_COURSE_ENROLMENTS: {
      const courseIds = asSet(filters.courseIds ?? filters.courseId);

      if (courseIds && !courseIds.has(String(row.courseId))) return false;

      return true;
    }

    case CAMPAIGN_SOURCE_TYPE.META_LEADS: {
      /**
       * **Narrowed by form, and only by form.**
       *
       * Page, campaign, ad set and ad are all on the row and all tempting, and
       * none of them is the right handle. An ad is swapped weekly and a
       * campaign is renamed mid-flight, so a trigger keyed on either quietly
       * stops firing the next time marketing tidies up. The form is the thing
       * that actually determines what the person was asked and therefore what
       * it makes sense to send them — and it is the same handle the routing
       * config is already keyed on.
       *
       * `formId` is Facebook's id, which is what `meta_forms.formId` stores and
       * what the picker sends back.
       */
      const formIds = asSet(filters.formIds ?? filters.formId);

      if (formIds && !formIds.has(String(row.formId))) return false;

      return true;
    }

    case CAMPAIGN_SOURCE_TYPE.USERS:
      // Nothing meaningful to narrow on: an account is an account.
      return true;

    default:
      return false;
  }
};

/** The seven sources a realtime trigger may watch. The panel reads this. */
export const REALTIME_TRIGGER_SOURCES = Object.freeze([
  CAMPAIGN_SOURCE_TYPE.LEADS,
  CAMPAIGN_SOURCE_TYPE.META_LEADS,
  CAMPAIGN_SOURCE_TYPE.EVENT_GUESTS,
  CAMPAIGN_SOURCE_TYPE.RESOURCE_LEADS,
  CAMPAIGN_SOURCE_TYPE.PROJECT_LEADS,
  CAMPAIGN_SOURCE_TYPE.FREE_COURSE_ENROLMENTS,
  CAMPAIGN_SOURCE_TYPE.USERS,
]);
