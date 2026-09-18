import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
import {
  LEAD_EVENT_TYPE,
  LEAD_EVENT_LABEL,
} from "../../config/constants/leadEvent.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { getMeta, getPaginationParams } from "../../util/helpers/pagination.js";
import { normaliseEmail } from "../../services/leadEvent/recordLeadEvent.service.js";

const { LeadEvent, Event, FreeCourse, Resource } = db;

/**
 * One person's history, in order.
 *
 * Read-only, and it stays that way — `lead_events` is append-only and there is
 * deliberately no write endpoint here, for the same reason `activity_logs` has
 * none: a record the API can rewrite is not a record of anything.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §4.5.
 */

/**
 * Turns the soft pointers in `metadata` into names.
 *
 * Three lookups for the whole page rather than one per row — a timeline of
 * forty events referencing eight events and three courses is eleven queries if
 * this is done naively, and it is the shape that turns a fast page slow as
 * somebody's history grows.
 *
 * A missing title is left null rather than faked. The event stream outlives the
 * rows it points at by design, so "an event that no longer exists" is a normal
 * state and the panel should render the row without a name, not hide it.
 */
const resolveTitles = async (rows) => {
  const ids = { events: new Set(), courses: new Set(), resources: new Set() };

  for (const row of rows) {
    const meta = row.metadata || {};
    if (meta.eventId) ids.events.add(meta.eventId);
    if (meta.courseId) ids.courses.add(meta.courseId);
    if (meta.resourceId) ids.resources.add(meta.resourceId);
  }

  const [events, courses, resources] = await Promise.all([
    ids.events.size
      ? Event.findAll({
          where: { id: { [Op.in]: [...ids.events] } },
          attributes: ["id", "eventTitle"],
        })
      : [],
    ids.courses.size
      ? FreeCourse.findAll({
          where: { id: { [Op.in]: [...ids.courses] } },
          attributes: ["id", "title"],
        })
      : [],
    ids.resources.size
      ? Resource.findAll({
          where: { id: { [Op.in]: [...ids.resources] } },
          attributes: ["id", "title"],
        })
      : [],
  ]);

  return {
    // `Event` uses `eventTitle`, not `title` — the same trap the activity log's
    // LABEL_FIELDS documents.
    events: new Map(events.map((e) => [e.id, e.eventTitle])),
    courses: new Map(courses.map((c) => [c.id, c.title])),
    resources: new Map(resources.map((r) => [r.id, r.title])),
  };
};

/**
 * GET /lead-events/admin/timeline?email=…
 *
 * Newest first. `label` and `subject` are rendered here rather than in the
 * panel so the wording lives in one place — a second copy of the label map in
 * `gradient-admin` is a copy that drifts.
 */
export const getPersonTimeline = asyncWrapper(async (req, res) => {
  const email = normaliseEmail(req.query.email);

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "An email is required",
    });
  }

  const { eventType } = req.query;

  if (eventType && !Object.values(LEAD_EVENT_TYPE).includes(eventType)) {
    // Named, not silently ignored. An unknown filter that returns everything
    // reads as "this person did all of that", which is worse than an error.
    return res.status(400).json({
      success: false,
      message: `Unknown event type: ${eventType}`,
    });
  }

  const { page, limit, offset } = getPaginationParams(req.query, 25, 100);

  const where = { email };
  if (eventType) where.eventType = eventType;

  const { rows, count } = await LeadEvent.findAndCountAll({
    where,
    // `occurredAt`, never `createdAt`: a backfilled row was written today and
    // happened two years ago, and ordering by the wrong one puts the whole of
    // someone's history in the wrong place.
    order: [
      ["occurredAt", "DESC"],
      ["id", "DESC"],
    ],
    limit,
    offset,
  });

  const titles = await resolveTitles(rows);

  const data = rows.map((row) => {
    const meta = row.metadata || {};

    return {
      id: row.id,
      eventType: row.eventType,
      label: LEAD_EVENT_LABEL[row.eventType] ?? row.eventType,
      subject:
        titles.events.get(meta.eventId) ??
        titles.courses.get(meta.courseId) ??
        titles.resources.get(meta.resourceId) ??
        null,
      occurredAt: row.occurredAt,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      metadata: meta,
      enrollmentId: row.enrollmentId,
    };
  });

  return res.json({
    success: true,
    data,
    meta: getMeta(count, page, limit),
  });
});

/**
 * GET /lead-events/admin/summary?email=…
 *
 * Counts per event type, for a header strip above the timeline. Separate from
 * the list because it is not paginated — the counts are of everything, and
 * deriving them from one page of results would be quietly wrong.
 */
export const getPersonSummary = asyncWrapper(async (req, res) => {
  const email = normaliseEmail(req.query.email);

  if (!email) {
    return res.status(400).json({
      success: false,
      message: "An email is required",
    });
  }

  const rows = await LeadEvent.findAll({
    where: { email },
    attributes: [
      "eventType",
      [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
      [db.sequelize.fn("MAX", db.sequelize.col("occurredAt")), "lastAt"],
    ],
    group: ["eventType"],
    raw: true,
  });

  return res.json({
    success: true,
    data: {
      email,
      total: rows.reduce((sum, row) => sum + Number(row.count), 0),
      byType: rows.map((row) => ({
        eventType: row.eventType,
        label: LEAD_EVENT_LABEL[row.eventType] ?? row.eventType,
        count: Number(row.count),
        lastAt: row.lastAt,
      })),
    },
  });
});
