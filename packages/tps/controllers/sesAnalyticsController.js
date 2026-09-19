"use strict";

const { Op, fn, col, literal } = require("sequelize");
const { SesEmailLog } = require("../models");

/**
 * Helper to build date range filters.
 */
function buildDateRange(period, startDate, endDate) {
  if (startDate || endDate) {
    const range = {};
    if (startDate) range[Op.gte] = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      range[Op.lte] = end;
    }
    return range;
  }

  const now = new Date();
  if (period === "today") {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { [Op.gte]: startOfToday };
  }
  if (period === "7d") {
    const past7d = new Date();
    past7d.setDate(now.getDate() - 7);
    return { [Op.gte]: past7d };
  }
  if (period === "30d" || !period) {
    const past30d = new Date();
    past30d.setDate(now.getDate() - 30);
    return { [Op.gte]: past30d };
  }
  return null;
}

let tableChecked = false;
async function ensureTable() {
  if (!tableChecked && SesEmailLog) {
    try {
      await SesEmailLog.sync();
      tableChecked = true;
    } catch (_) {}
  }
}

/**
 * GET /api/v1/ses-analytics/stats
 * Overview metrics, cost estimation, breakdown by source, and daily trends.
 */
exports.getStats = async (req, res) => {
  try {
    await ensureTable();
    const { period = "30d", startDate, endDate, senderEmail } = req.query;

    const where = {};
    const dateRange = buildDateRange(period, startDate, endDate);
    if (dateRange) where.createdAt = dateRange;
    if (senderEmail) where.sender_email = senderEmail;

    // 1. Total counts by status
    const statusCounts = await SesEmailLog.findAll({
      where,
      attributes: ["status", [fn("COUNT", col("id")), "count"]],
      group: ["status"],
      raw: true,
    });

    let total = 0;
    let sent = 0;
    let failed = 0;
    let bounced = 0;
    let complaints = 0;

    for (const item of statusCounts) {
      const count = parseInt(item.count, 10) || 0;
      total += count;
      if (item.status === "SENT") sent += count;
      if (item.status === "FAILED") failed += count;
      if (item.status === "BOUNCED") bounced += count;
      if (item.status === "COMPLAINT") complaints += count;
    }

    // 2. Total estimated cost
    const costAggregate = await SesEmailLog.findOne({
      where,
      attributes: [[fn("SUM", col("estimated_cost_usd")), "totalCost"]],
      raw: true,
    });
    const totalCostUsd = parseFloat(costAggregate?.totalCost || 0);

    // 3. Breakdown by Source
    const sourceRows = await SesEmailLog.findAll({
      where,
      attributes: [
        "source",
        [fn("COUNT", col("id")), "count"],
        [fn("SUM", col("estimated_cost_usd")), "costUsd"],
      ],
      group: ["source"],
      order: [[literal('"count"'), "DESC"]],
      raw: true,
    });

    const sourceBreakdown = sourceRows.map((r) => {
      const count = parseInt(r.count, 10) || 0;
      const cost = parseFloat(r.costUsd || 0);
      const percentage = total > 0 ? Number(((count / total) * 100).toFixed(1)) : 0;
      return {
        source: r.source,
        count,
        costUsd: Number(cost.toFixed(4)),
        percentage,
      };
    });

    // 4. Daily dispatch trend (grouped by DATE(createdAt))
    const dailyRows = await SesEmailLog.findAll({
      where,
      attributes: [
        [fn("DATE", col("createdAt")), "date"],
        [fn("COUNT", col("id")), "count"],
        [fn("SUM", col("estimated_cost_usd")), "costUsd"],
      ],
      group: [fn("DATE", col("createdAt"))],
      order: [[fn("DATE", col("createdAt")), "ASC"]],
      raw: true,
    });

    const dailyTrend = dailyRows.map((r) => ({
      date: r.date,
      count: parseInt(r.count, 10) || 0,
      costUsd: Number(parseFloat(r.costUsd || 0).toFixed(4)),
    }));

    // 5. Breakdown by Sender Email
    const senderRows = await SesEmailLog.findAll({
      where,
      attributes: [
        "sender_email",
        [fn("COUNT", col("id")), "count"],
        [fn("SUM", col("estimated_cost_usd")), "costUsd"],
      ],
      group: ["sender_email"],
      order: [[literal('"count"'), "DESC"]],
      raw: true,
    });

    const senderBreakdown = senderRows.map((r) => ({
      senderEmail: r.sender_email,
      count: parseInt(r.count, 10) || 0,
      costUsd: Number(parseFloat(r.costUsd || 0).toFixed(4)),
    }));

    const deliveryRate = total > 0 ? Number(((sent / total) * 100).toFixed(1)) : 100;

    return res.status(200).json({
      success: true,
      period,
      summary: {
        totalEmails: total,
        sentCount: sent,
        failedCount: failed,
        bouncedCount: bounced,
        complaintCount: complaints,
        deliveryRate,
        estimatedCostUsd: Number(totalCostUsd.toFixed(4)),
        highestCostSource: sourceBreakdown[0] || null,
      },
      sourceBreakdown,
      dailyTrend,
      senderBreakdown,
    });
  } catch (error) {
    console.error("Error fetching SES stats:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch SES analytics stats",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/ses-analytics/logs
 * Paginated list of raw SES email logs with filters.
 */
exports.getLogs = async (req, res) => {
  try {
    await ensureTable();
    const {
      page = 1,
      limit = 25,
      source,
      status,
      senderEmail,
      search,
      startDate,
      endDate,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * limitNum;

    const where = {};

    if (source && source !== "ALL") where.source = source;
    if (status && status !== "ALL") where.status = status;
    if (senderEmail && senderEmail !== "ALL") where.sender_email = senderEmail;

    const dateRange = buildDateRange(null, startDate, endDate);
    if (dateRange) where.createdAt = dateRange;

    if (search && search.trim()) {
      const q = `%${search.trim()}%`;
      where[Op.or] = [
        { recipient_email: { [Op.iLike]: q } },
        { subject: { [Op.iLike]: q } },
        { source_name: { [Op.iLike]: q } },
        { correlation_id: { [Op.iLike]: q } },
        { message_id: { [Op.iLike]: q } },
      ];
    }

    const { count, rows } = await SesEmailLog.findAndCountAll({
      where,
      limit: limitNum,
      offset,
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        total: count,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(count / limitNum),
      },
    });
  } catch (error) {
    console.error("Error fetching SES logs:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch SES logs",
      error: error.message,
    });
  }
};

/**
 * GET /api/v1/ses-analytics/sources
 * Returns distinct sources and senders for UI filter dropdowns.
 */
exports.getFilterOptions = async (req, res) => {
  try {
    await ensureTable();
    const [sources, senders] = await Promise.all([
      SesEmailLog.findAll({
        attributes: [[literal("DISTINCT source"), "source"]],
        raw: true,
      }),
      SesEmailLog.findAll({
        attributes: [[literal("DISTINCT sender_email"), "sender_email"]],
        raw: true,
      }),
    ]);

    return res.status(200).json({
      success: true,
      sources: sources.map((s) => s.source).filter(Boolean),
      senders: senders.map((s) => s.sender_email).filter(Boolean),
    });
  } catch (error) {
    console.error("Error fetching filter options:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch filter options",
      error: error.message,
    });
  }
};
