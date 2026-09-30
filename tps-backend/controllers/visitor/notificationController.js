const { Op } = require("sequelize");
const { VisitorNotificationHistory } = require("../../models");
const { getPaginationParams, getMeta } = require("../../utils/pagination");

//GET /visitor/notifications
exports.getNotifications = async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query, 20, 100);
  const { search, readStatus, pageUrl, ignorePatterns } = req.query;

  const whereClause = {};

  // Filter by read/unread
  if (readStatus === "read") {
    whereClause.isRead = true;
  } else if (readStatus === "unread") {
    whereClause.isRead = false;
  }

  // Filter by page URL
  // PARSE IGNORE PATTERNS (used for "other" filter)
  const ignoreList = ignorePatterns
    ? ignorePatterns.split(",").filter(Boolean)
    : [];

  if (pageUrl && pageUrl.trim().length > 0) {
    // 1. OTHER → everything except exact + wildcard patterns
    if (pageUrl === "other") {
      whereClause[Op.and] = ignoreList.map((pattern) => {
        if (pattern.endsWith("*")) {
          const prefix = pattern.replace("*", "");
          return { page: { [Op.notLike]: `${prefix}%` } };
        }
        return { page: { [Op.ne]: pattern } }; // exact mismatch
      });
    }

    // 2. wildcard dynamic route (/events*)
    else if (pageUrl.endsWith("*")) {
      const prefix = pageUrl.replace("*", "");
      whereClause.page = { [Op.like]: `${prefix}%` };
    }

    // 3. exact match
    else {
      whereClause.page = pageUrl;
    }
  }

  // Search by name, email, phone or visitorId
  if (search && search.trim().length > 0) {
    whereClause[Op.or] = [
      { visitorId: { [Op.iLike]: `%${search}%` } },
      { name: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } },
      { phone: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const { count, rows } = await VisitorNotificationHistory.findAndCountAll({
    where: whereClause,
    limit,
    offset,
    order: [["timestamp", "DESC"]],
  });

  const meta = getMeta(count, page, limit);

  return res.status(200).json({
    success: true,
    meta,
    data: rows,
  });
};

//GET /visitor/notifications/export
exports.exportNotifications = async (req, res) => {
  const { search, readStatus, pageUrl, ignorePatterns, dateFrom, dateTo } =
    req.query;

  const whereClause = {};

  // Filter by read/unread
  if (readStatus === "read") {
    whereClause.isRead = true;
  } else if (readStatus === "unread") {
    whereClause.isRead = false;
  }

  // Filter by page URL
  // PARSE IGNORE PATTERNS (used for "other" filter)
  const ignoreList = ignorePatterns
    ? ignorePatterns.split(",").filter(Boolean)
    : [];

  if (pageUrl && pageUrl.trim().length > 0) {
    // 1. OTHER → everything except exact + wildcard patterns
    if (pageUrl === "other") {
      whereClause[Op.and] = ignoreList.map((pattern) => {
        if (pattern.endsWith("*")) {
          const prefix = pattern.replace("*", "");
          return { page: { [Op.notLike]: `${prefix}%` } };
        }
        return { page: { [Op.ne]: pattern } }; // exact mismatch
      });
    }

    // 2. wildcard dynamic route (/events*)
    else if (pageUrl.endsWith("*")) {
      const prefix = pageUrl.replace("*", "");
      whereClause.page = { [Op.like]: `${prefix}%` };
    }

    // 3. exact match
    else {
      whereClause.page = pageUrl;
    }
  }

  // Search by name, email, phone or visitorId
  if (search && search.trim().length > 0) {
    whereClause[Op.or] = [
      { visitorId: { [Op.iLike]: `%${search}%` } },
      { name: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } },
      { phone: { [Op.iLike]: `%${search}%` } },
    ];
  }

  // Date Filter
  if (dateFrom || dateTo) {
    whereClause.timestamp = {};
    if (dateFrom) {
      const start = new Date(dateFrom);
      start.setHours(0, 0, 0, 0); // 12 AM
      whereClause.timestamp[Op.gte] = start;
    }

    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999); // 11:59:59 PM
      whereClause.timestamp[Op.lte] = end;
    }
  }

  const data = await VisitorNotificationHistory.findAll({
    where: whereClause,
    order: [["timestamp", "DESC"]],
  });

  return res.status(200).json({
    success: true,
    data,
  });
};

// POST /visitor/notification/mark-read
exports.markAsRead = async (req, res) => {
  const { notificationId } = req.body;

  if (!notificationId) {
    return res.status(400).json({
      error: "notificationId is required",
    });
  }

  await VisitorNotificationHistory.update(
    { isRead: true },
    { where: { id: notificationId } }
  );

  return res.status(200).json({
    message: "Notification marked as read",
  });
};

// GET /visitor/notifications/unread-count
exports.getUnreadCount = async (req, res) => {
  try {
    const whereClause = { isRead: false };

    const count = await VisitorNotificationHistory.count({
      where: whereClause,
    });

    return res.status(200).json({
      success: true,
      unreadCount: count,
    });
  } catch (error) {
    console.error("Failed to fetch unread count:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to get unread count",
    });
  }
};
