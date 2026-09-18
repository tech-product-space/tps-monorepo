import db from "../../../database/postgres/models/index.js";
import { CAMPAIGN_SOURCE_TYPE } from "../../../config/constants/campaign.js";
import { EVENT_CERTIFICATE_STATUS } from "../../../config/constants/eventCertificate.js";
import { FREE_COURSE_CERTIFICATE_STATUS } from "../../../config/constants/freeCourseCertificate.js";
import {
  compact,
  dateRangeClause,
  inClause,
  toRecipient,
} from "./helpers.js";

const { EventCertificate, FreeCourseCertificate } = db;

/**
 * People who earned a certificate — of either kind.
 *
 * The highest-intent audience in the database: a certificate is proof somebody
 * turned up and finished. It is also among the cheapest sources to resolve —
 * `recipientEmail` sits on both rows, already lowercased by the models'
 * setters, so there is no join and no null-email guard to get wrong.
 *
 * **Both tables, deliberately.** Free course certificates live in their own
 * table (see `FREE_COURSE_CERTIFICATE_PLAN.md` §2.3). Resolving only the event
 * one would quietly exclude every course certificate holder — and the failure
 * mode of that is a campaign that reads as working while under-sending, which
 * nobody investigates.
 *
 * Filters, and which side each applies to:
 *
 *   - **`status` defaults to `Issued`** on both. A `Pending` or `Failed` row is
 *     someone whose certificate does not exist yet, and `Revoked` is one
 *     deliberately taken away. Mailing either as "certified alumni" would be
 *     wrong, so the default is the only status that means "holds a
 *     certificate". Overridable, because re-targeting failures is legitimate.
 *   - **`eventId` and `source` are event-only.** `source` separates `Attendee`
 *     from `Teammate` — a teammate was named inside someone else's feedback and
 *     may never have registered. Neither concept exists for a course, so
 *     setting either **narrows the audience to event certificates**; including
 *     course holders under an event filter would ignore the filter.
 *   - **`freeCourseId` is course-only**, and narrows the other way.
 *
 * With none of those set, the audience is everyone who has ever earned a
 * certificate — which is a coherent thing to want, and is why no selection
 * means "all" here rather than "nobody" as it does for `eventGuests`.
 */
export const resolveCertificateHolders = async (filters = {}) => {
  const wantsEventOnly = Boolean(filters.eventId || filters.source);
  const wantsCourseOnly = Boolean(filters.freeCourseId);

  const includeEvents = !wantsCourseOnly;
  const includeCourses = !wantsEventOnly;

  const dateRange = dateRangeClause(filters.createdFrom, filters.createdTo);

  const [eventRows, courseRows] = await Promise.all([
    includeEvents
      ? EventCertificate.findAll({
          where: compact({
            eventId: inClause(filters.eventId),
            source: inClause(filters.source),
            status: inClause(filters.status ?? EVENT_CERTIFICATE_STATUS.ISSUED),
            createdAt: dateRange,
          }),
          attributes: ["id", ["recipientName", "name"], ["recipientEmail", "email"]],
          raw: true,
        })
      : [],

    includeCourses
      ? FreeCourseCertificate.findAll({
          where: compact({
            freeCourseId: inClause(filters.freeCourseId),
            status: inClause(
              filters.status ?? FREE_COURSE_CERTIFICATE_STATUS.ISSUED,
            ),
            createdAt: dateRange,
          }),
          attributes: ["id", ["recipientName", "name"], ["recipientEmail", "email"]],
          raw: true,
        })
      : [],
  ]);

  // Somebody with both an event and a course certificate is one person and must
  // be mailed once. Deduped on address here rather than left to the send: the
  // preview count is what an admin sanity-checks against, and a number inflated
  // by duplicates is the one they would not question.
  const byEmail = new Map();

  for (const row of [...eventRows, ...courseRows]) {
    const key = String(row.email || "").trim().toLowerCase();
    if (!key || byEmail.has(key)) continue;
    byEmail.set(key, row);
  }

  return [...byEmail.values()].map(
    toRecipient(CAMPAIGN_SOURCE_TYPE.CERTIFICATE_HOLDERS),
  );
};
