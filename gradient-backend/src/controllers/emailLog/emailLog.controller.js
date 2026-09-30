import { Op, fn, col, literal } from "sequelize";
import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { getPaginationParams, getMeta } from "../../util/helpers/pagination.js";

const { EmailDispatchLog } = db;

/**
 * Builds the Sequelize WHERE condition from request query filters.
 */
const buildWhere = (query) => {
  const { search, source, status, sender, timeRange, dateFrom, dateTo } = query;
  const where = {};

  if (source && source !== "all" && source !== "All Sources") {
    if (typeof source === "string" && source.includes(",")) {
      where.source = { [Op.in]: source.split(",").map((s) => s.trim()).filter(Boolean) };
    } else {
      where.source = source;
    }
  }

  if (status && status !== "all" && status !== "All Statuses") {
    where.status = status;
  }

  if (sender && sender !== "all" && sender !== "All Sender Addresses") {
    where.sender = sender;
  }

  // Time range calculation
  const now = new Date();
  if (timeRange && timeRange !== "all") {
    if (timeRange === "today") {
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      where.sentAt = { [Op.gte]: startOfDay };
    } else if (timeRange === "7d") {
      const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      where.sentAt = { [Op.gte]: past7 };
    } else if (timeRange === "30d") {
      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      where.sentAt = { [Op.gte]: past30 };
    }
  } else if (dateFrom || dateTo) {
    where.sentAt = {};
    if (dateFrom) {
      const from = new Date(dateFrom);
      if (!Number.isNaN(from.getTime())) where.sentAt[Op.gte] = from;
    }
    if (dateTo) {
      const to = new Date(dateTo);
      if (!Number.isNaN(to.getTime())) {
        if (!/T/.test(dateTo)) to.setHours(23, 59, 59, 999);
        where.sentAt[Op.lte] = to;
      }
    }
    if (Object.keys(where.sentAt).length === 0) delete where.sentAt;
  }

  if (search && search.trim()) {
    const term = search.trim();
    where[Op.or] = [
      { recipient: { [Op.iLike]: `%${term}%` } },
      { subject: { [Op.iLike]: `%${term}%` } },
      { sender: { [Op.iLike]: `%${term}%` } },
      { correlationId: { [Op.iLike]: `%${term}%` } },
      { messageId: { [Op.iLike]: `%${term}%` } },
    ];
  }

  return where;
};

/**
 * Enriches dispatch logs with human-readable entity names (Event titles,
 * Campaign names, Workflow titles, Project names, etc.) instead of raw IDs.
 */
const enrichLogsWithEntityNames = async (logs) => {
  if (!Array.isArray(logs) || logs.length === 0) return logs;

  const eventIdsToFetch = new Set();
  const campaignIdsToFetch = new Set();
  const workflowIdsToFetch = new Set();
  const projectIdsToFetch = new Set();
  const courseIdsToFetch = new Set();

  logs.forEach((log) => {
    const meta = log.metadata || {};
    const corr = log.correlationId || "";

    if (!meta.eventTitle) {
      const eid = meta.eventId || corr.match(/Event\s*#([A-Za-z0-9_-]+)/i)?.[1];
      if (eid) eventIdsToFetch.add(eid);
    }

    if (!meta.campaignTitle) {
      const cid = meta.campaignId || corr.match(/Campaign\s*#([A-Za-z0-9_-]+)/i)?.[1];
      if (cid) campaignIdsToFetch.add(cid);
    }

    if (!meta.workflowTitle) {
      const wid = meta.workflowId || corr.match(/Workflow\s*#([A-Za-z0-9_-]+)/i)?.[1];
      if (wid) workflowIdsToFetch.add(wid);
    }

    if (!meta.projectTitle) {
      const pid = meta.projectId || corr.match(/Project\s*#([A-Za-z0-9_-]+)/i)?.[1];
      if (pid) projectIdsToFetch.add(pid);
    }

    if (!meta.courseTitle) {
      const fkid = meta.freeCourseId || meta.courseId || corr.match(/Free Course\s*#([A-Za-z0-9_-]+)/i)?.[1];
      if (fkid) courseIdsToFetch.add(fkid);
    }
  });

  const [events, campaigns, workflows, projects, courses] = await Promise.all([
    eventIdsToFetch.size > 0 && db.Event
      ? db.Event.findAll({
          where: { id: Array.from(eventIdsToFetch) },
          attributes: ["id", "eventTitle"],
          raw: true,
        }).catch(() => [])
      : [],
    campaignIdsToFetch.size > 0 && db.Campaign
      ? db.Campaign.findAll({
          where: { id: Array.from(campaignIdsToFetch) },
          attributes: ["id", "title"],
          raw: true,
        }).catch(() => [])
      : [],
    workflowIdsToFetch.size > 0 && db.Workflow
      ? db.Workflow.findAll({
          where: { id: Array.from(workflowIdsToFetch) },
          attributes: ["id", "title"],
          raw: true,
        }).catch(() => [])
      : [],
    projectIdsToFetch.size > 0 && db.Project
      ? db.Project.findAll({
          where: { id: Array.from(projectIdsToFetch) },
          attributes: ["id", "title"],
          raw: true,
        }).catch(() => [])
      : [],
    courseIdsToFetch.size > 0 && db.FreeCourse
      ? db.FreeCourse.findAll({
          where: { id: Array.from(courseIdsToFetch) },
          attributes: ["id", "title"],
          raw: true,
        }).catch(() => [])
      : [],
  ]);

  const eventMap = new Map((events || []).map((e) => [String(e.id), e.eventTitle]));
  const campaignMap = new Map((campaigns || []).map((c) => [String(c.id), c.title]));
  const workflowMap = new Map((workflows || []).map((w) => [String(w.id), w.title]));
  const projectMap = new Map((projects || []).map((p) => [String(p.id), p.title]));
  const courseMap = new Map((courses || []).map((c) => [String(c.id), c.title]));

  logs.forEach((log) => {
    const meta = log.metadata || {};
    const corr = log.correlationId || "";

    const suffixMatch = corr.match(/\(([^)]+)\)$/);
    const suffix = suffixMatch ? `(${suffixMatch[1]})` : null;

    let entityName = null;

    if (meta.eventTitle) {
      entityName = meta.eventTitle;
    } else {
      const eid = meta.eventId || corr.match(/Event\s*#([A-Za-z0-9_-]+)/i)?.[1];
      if (eid && eventMap.has(String(eid))) {
        entityName = eventMap.get(String(eid));
      }
    }

    if (!entityName) {
      if (meta.campaignTitle) {
        entityName = meta.campaignTitle;
      } else {
        const cid = meta.campaignId || corr.match(/Campaign\s*#([A-Za-z0-9_-]+)/i)?.[1];
        if (cid && campaignMap.has(String(cid))) {
          entityName = campaignMap.get(String(cid));
        }
      }
    }

    if (!entityName) {
      if (meta.workflowTitle) {
        entityName = meta.workflowTitle;
      } else {
        const wid = meta.workflowId || corr.match(/Workflow\s*#([A-Za-z0-9_-]+)/i)?.[1];
        if (wid && workflowMap.has(String(wid))) {
          entityName = workflowMap.get(String(wid));
        }
      }
    }

    if (!entityName) {
      if (meta.projectTitle) {
        entityName = meta.projectTitle;
      } else {
        const pid = meta.projectId || corr.match(/Project\s*#([A-Za-z0-9_-]+)/i)?.[1];
        if (pid && projectMap.has(String(pid))) {
          entityName = projectMap.get(String(pid));
        }
      }
    }

    if (!entityName) {
      if (meta.courseTitle) {
        entityName = meta.courseTitle;
      } else {
        const fkid = meta.freeCourseId || meta.courseId || corr.match(/Free Course\s*#([A-Za-z0-9_-]+)/i)?.[1];
        if (fkid && courseMap.has(String(fkid))) {
          entityName = courseMap.get(String(fkid));
        }
      }
    }

    // Extract title from parenthetical if present: Campaign #123 (My Campaign)
    if (!entityName && corr) {
      const parenthetical = corr.match(/^[A-Za-z\s]+#[A-Za-z0-9_-]+\s*\(([^)]+)\)$/);
      if (parenthetical && !["Waitlist", "Confirmed", "Test Send", "Submission Ack"].includes(parenthetical[1])) {
        entityName = parenthetical[1];
      }
    }

    if (entityName) {
      if (suffix && !entityName.includes(suffix) && ["(Waitlist)", "(Confirmed)", "(Test Send)"].includes(suffix)) {
        entityName = `${entityName} ${suffix}`;
      }
      log.setDataValue("entityName", entityName);
    } else {
      log.setDataValue("entityName", log.correlationId);
    }
  });

  return logs;
};

/**
 * GET /email-logs/admin/logs
 * Returns paginated dispatch audit logs.
 */
export const getEmailDispatchLogs = asyncWrapper(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query, 10);
  const where = buildWhere(req.query);

  const { rows, count } = await EmailDispatchLog.findAndCountAll({
    where,
    attributes: {
      exclude: ["bodyHtml"], // Keep list query lightweight
    },
    limit,
    offset,
    order: [["sentAt", "DESC"]],
  });

  await enrichLogsWithEntityNames(rows);

  return res.status(200).json({
    success: true,
    data: rows,
    meta: getMeta(count, page, limit),
  });
});

/**
 * GET /email-logs/admin/stats
 * Computes telemetry KPI cards, daily dispatch trend, and source attribution.
 */
export const getEmailDispatchStats = asyncWrapper(async (req, res) => {
  const where = buildWhere(req.query);

  // Total and status counts
  const statusCounts = await EmailDispatchLog.findAll({
    where,
    attributes: [
      "status",
      [fn("COUNT", col("id")), "count"],
      [fn("SUM", col("estimatedCost")), "totalSpend"],
    ],
    group: ["status"],
    raw: true,
  });

  let totalDispatched = 0;
  let successfulDispatched = 0;
  let bouncesCount = 0;
  let complaintsCount = 0;
  let failedCount = 0;
  let totalSpendNum = 0;

  statusCounts.forEach((item) => {
    const c = parseInt(item.count, 10) || 0;
    const s = parseFloat(item.totalSpend) || c * 0.0001;
    totalDispatched += c;
    totalSpendNum += s;

    if (item.status === "SENT") successfulDispatched += c;
    else if (item.status === "FAILED") failedCount += c;
    else if (item.status === "BOUNCED") bouncesCount += c;
    else if (item.status === "COMPLAINT") complaintsCount += c;
  });

  const deliveryRate = totalDispatched > 0
    ? ((successfulDispatched / totalDispatched) * 100).toFixed(1)
    : "100.0";

  // Attribution by source
  const sourceRows = await EmailDispatchLog.findAll({
    where,
    attributes: [
      "source",
      [fn("COUNT", col("id")), "count"],
      [fn("SUM", col("estimatedCost")), "spend"],
    ],
    group: ["source"],
    order: [[literal("count"), "DESC"]],
    raw: true,
  });

  const attribution = sourceRows.map((row) => {
    const count = parseInt(row.count, 10) || 0;
    const spend = parseFloat(row.spend) || count * 0.0001;
    const percentage = totalDispatched > 0
      ? ((count / totalDispatched) * 100).toFixed(1)
      : "0.0";
    return {
      source: row.source,
      count,
      spend: Number(spend.toFixed(4)),
      percentage: Number(percentage),
    };
  });

  const topCostDriver = attribution.length > 0
    ? {
        source: attribution[0].source,
        percentage: attribution[0].percentage,
        count: attribution[0].count,
      }
    : {
        source: "None",
        percentage: 0,
        count: 0,
      };

  // Trend timeline (daily points)
  // Determine date span to group by day
  const trendRows = await EmailDispatchLog.findAll({
    where,
    attributes: [
      [fn("DATE_TRUNC", "day", col("sentAt")), "date"],
      [fn("COUNT", col("id")), "count"],
      [fn("SUM", col("estimatedCost")), "spend"],
    ],
    group: [literal("DATE_TRUNC('day', \"sentAt\")")],
    order: [[literal("DATE_TRUNC('day', \"sentAt\")"), "ASC"]],
    raw: true,
  });

  const trend = trendRows.map((row) => {
    const d = new Date(row.date);
    const label = d.toLocaleDateString("en-US", { day: "numeric", month: "short" });
    const count = parseInt(row.count, 10) || 0;
    const spend = parseFloat(row.spend) || count * 0.0001;
    return {
      rawDate: row.date,
      date: label,
      count,
      spend: Number(spend.toFixed(4)),
    };
  });

  return res.status(200).json({
    success: true,
    data: {
      totalDispatched,
      successfulDispatched,
      deliveryRate: Number(deliveryRate),
      totalSpend: Number(totalSpendNum.toFixed(4)),
      topCostDriver,
      bouncesCount,
      complaintsCount,
      failedCount,
      attribution,
      trend,
    },
  });
});

/**
 * GET /email-logs/admin/logs/:id
 * Returns single full dispatch log record including full bodyHtml.
 */
export const getEmailDispatchLogById = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const log = await EmailDispatchLog.findByPk(id);

  if (!log) {
    return res.status(404).json({
      success: false,
      message: "Email dispatch log record not found",
    });
  }

  await enrichLogsWithEntityNames([log]);

  return res.status(200).json({
    success: true,
    data: log,
  });
});

/**
 * GET /email-logs/admin/filter-options
 * Returns distinct sources, statuses, and senders available in logs.
 */
export const getEmailFilterOptions = asyncWrapper(async (req, res) => {
  const [sources, statuses, senders] = await Promise.all([
    EmailDispatchLog.findAll({
      attributes: [[fn("DISTINCT", col("source")), "source"]],
      raw: true,
    }),
    EmailDispatchLog.findAll({
      attributes: [[fn("DISTINCT", col("status")), "status"]],
      raw: true,
    }),
    EmailDispatchLog.findAll({
      attributes: [[fn("DISTINCT", col("sender")), "sender"]],
      raw: true,
    }),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      sources: sources.map((s) => s.source).filter(Boolean),
      statuses: statuses.map((s) => s.status).filter(Boolean),
      senders: senders.map((s) => s.sender).filter(Boolean),
    },
  });
});
