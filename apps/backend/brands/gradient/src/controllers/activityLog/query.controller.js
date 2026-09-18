import { Op } from "sequelize";
import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { getMeta, getPaginationParams } from "../../util/helpers/pagination.js";

const { ActivityLog } = db;

/**
 * Read-only by design. There is no create/update/delete handler here and there
 * should never be one — an audit trail that the API can rewrite is not evidence
 * of anything. Rows are written only by the middleware.
 */

const buildWhere = (query) => {
  const { actorId, entityType, entityId, action, status, dateFrom, dateTo, search } =
    query;

  const where = {};

  if (actorId) where.actorId = actorId;
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (action) where.action = action;
  if (status) where.status = status;

  if (dateFrom || dateTo) {
    where.createdAt = {};

    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!Number.isNaN(from.getTime())) where.createdAt[Op.gte] = from;
    }

    if (dateTo) {
      const to = new Date(dateTo);

      if (!Number.isNaN(to.getTime())) {
        // A bare date means "through the end of that day", which is what an
        // admin picking 10 Aug in a date filter means.
        if (!/T/.test(dateTo)) to.setHours(23, 59, 59, 999);
        where.createdAt[Op.lte] = to;
      }
    }

    if (Object.keys(where.createdAt).length === 0) delete where.createdAt;
  }

  if (search) {
    where[Op.or] = [
      { actorName: { [Op.iLike]: `%${search}%` } },
      { actorEmail: { [Op.iLike]: `%${search}%` } },
      { entityLabel: { [Op.iLike]: `%${search}%` } },
      { summary: { [Op.iLike]: `%${search}%` } },
    ];
  }

  return where;
};

export const listActivityLogs = asyncWrapper(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);

  const { rows, count } = await ActivityLog.findAndCountAll({
    where: buildWhere(req.query),
    limit,
    offset,
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json({
    success: true,
    data: rows,
    meta: getMeta(count, page, limit),
  });
});

/** Backs the reusable <ActivityTimeline /> on any detail page. */
export const getEntityActivity = asyncWrapper(async (req, res) => {
  const { entityType, entityId } = req.params;
  const { page, limit, offset } = getPaginationParams(req.query, 20);

  const { rows, count } = await ActivityLog.findAndCountAll({
    where: { entityType, entityId },
    limit,
    offset,
    order: [["createdAt", "DESC"]],
  });

  return res.status(200).json({
    success: true,
    data: rows,
    meta: getMeta(count, page, limit),
  });
});

/**
 * Only values actually present in the table, so a filter never offers an option
 * that returns an empty list.
 */
export const getActivityFilters = asyncWrapper(async (req, res) => {
  const [actors, entityTypes, actions] = await Promise.all([
    ActivityLog.findAll({
      attributes: ["actorId", "actorName", "actorEmail"],
      where: { actorId: { [Op.ne]: null } },
      group: ["actorId", "actorName", "actorEmail"],
      order: [["actorName", "ASC"]],
      raw: true,
    }),
    ActivityLog.findAll({
      attributes: ["entityType"],
      group: ["entityType"],
      order: [["entityType", "ASC"]],
      raw: true,
    }),
    ActivityLog.findAll({
      attributes: ["action"],
      group: ["action"],
      order: [["action", "ASC"]],
      raw: true,
    }),
  ]);

  // An admin who was renamed appears once per name they acted under; collapse to
  // the most recent, which is what a filter dropdown wants.
  const actorsById = new Map();

  for (const actor of actors) {
    actorsById.set(actor.actorId, actor);
  }

  return res.status(200).json({
    success: true,
    data: {
      actors: [...actorsById.values()],
      entityTypes: entityTypes.map((row) => row.entityType),
      actions: actions.map((row) => row.action),
    },
  });
});

const CSV_EXPORT_CAP = 10_000;

const toCsvCell = (value) => {
  if (value === null || value === undefined) return "";

  const str =
    typeof value === "object" ? JSON.stringify(value) : String(value);

  return `"${str.replace(/"/g, '""')}"`;
};

export const exportActivityLogs = asyncWrapper(async (req, res) => {
  const rows = await ActivityLog.findAll({
    where: buildWhere(req.query),
    order: [["createdAt", "DESC"]],
    limit: CSV_EXPORT_CAP,
    raw: true,
  });

  const columns = [
    "createdAt",
    "actorName",
    "actorEmail",
    "actorRole",
    "action",
    "entityType",
    "entityId",
    "entityLabel",
    "summary",
    "changes",
    "status",
    "method",
    "path",
    "ipAddress",
  ];

  const lines = [
    columns.join(","),
    ...rows.map((row) => columns.map((col) => toCsvCell(row[col])).join(",")),
  ];

  // The cap is stated in the file rather than silently applied — a truncated
  // export that looks complete is how people draw wrong conclusions from it.
  if (rows.length === CSV_EXPORT_CAP) {
    lines.push(
      toCsvCell(
        `NOTE: capped at ${CSV_EXPORT_CAP} rows. Narrow the date range for the rest.`,
      ),
    );
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="activity-log.csv"`,
  );

  return res.status(200).send(lines.join("\n"));
});
