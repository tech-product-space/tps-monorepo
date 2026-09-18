const { Visitor, sequelize } = require("../../models");
const { Op } = require("sequelize");
const generateVisitorId = require("../../utils/generateVisitorId");
const { getPaginationParams, getMeta } = require("../../utils/pagination");

//POST /visitor/create
exports.createVisitor = async (req, res) => {
  const visitorId = generateVisitorId();

  const userAgent = req.headers["user-agent"] || "";

  const date = new Date();

  await Visitor.create({
    id: visitorId,
    firstSeen: date,
    lastSeen: date,
    userAgent,
  });

  return res.status(200).json({
    visitorId,
  });
};

// GET /visitor/:visitorId
exports.viewVisitor = async (req, res) => {
  const { visitorId } = req.params;

  if (!visitorId) {
    return res.status(400).json({ error: "visitorId is required" });
  }

  const visitor = await Visitor.findByPk(visitorId);

  if (!visitor) {
    return res.status(404).json({ error: "Visitor not found" });
  }

  return res.status(200).json({
    message: "Visitor fetched successfully",
    data: visitor,
  });
};

//POST /visitor/block/:visitorId
exports.blockVisitor = async (req, res) => {
  const { visitorId } = req.params;
  const { blockingReason: reason } = req.body;

  if (!visitorId) {
    return res.status(400).json({ error: "visitorId is required" });
  }

  if (!reason || reason.trim() === "") {
    return res.status(400).json({ error: "'blockingReason' is required" });
  }

  const visitor = await Visitor.findByPk(visitorId);

  if (!visitor) {
    return res.status(404).json({ error: "Visitor not found" });
  }

  visitor.isBlocked = true;
  visitor.blockingReason = reason;
  await visitor.save();

  return res.status(200).json({
    message: "Visitor blocked successfully",
  });
};

//POST /visitor/unblock/:visitorId
exports.unblockVisitor = async (req, res) => {
  const { visitorId } = req.params;

  if (!visitorId) {
    return res.status(400).json({ error: "visitorId is required" });
  }

  const visitor = await Visitor.findByPk(visitorId);

  if (!visitor) {
    return res.status(404).json({ error: "Visitor not found" });
  }

  visitor.isBlocked = false;
  visitor.blockingReason = null;
  await visitor.save();

  return res.status(200).json({
    message: "Visitor unblocked successfully",
  });
};

// GET /visitor/blocked
exports.getBlockedVisitors = async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query, 20, 100);

  // COUNT total blocked visitors
  const countResult = await sequelize.query(
    `
    SELECT COUNT(*) AS total 
    FROM "Visitors"
    WHERE "isBlocked" = true
    `,
    { type: sequelize.QueryTypes.SELECT }
  );

  const total = parseInt(countResult[0].total);

  // If no blocked visitors
  if (total === 0) {
    return res.status(200).json({
      success: true,
      meta: getMeta(0, page, limit),
      data: [],
    });
  }

  const results = await sequelize.query(
    `
    SELECT 
      v.id as "visitorId",
      v."lastVisitedUrl",
      v."createdAt",
      v."updatedAt",

      -- Latest contact info
      lc.name AS "name",
      lc.email AS "email",
      lc.phone AS "phone"

    FROM "Visitors" v

    LEFT JOIN (
      SELECT DISTINCT ON ("visitorId")
        "visitorId",
        name,
        email,
        phone,
        "createdAt"
      FROM "VisitorContacts"
      ORDER BY "visitorId", "createdAt" DESC
    ) AS lc
    ON lc."visitorId" = v.id

    WHERE v."isBlocked" = true
    ORDER BY v."updatedAt" DESC
    LIMIT :limit OFFSET :offset
    `,
    {
      replacements: { limit, offset },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  const meta = getMeta(total, page, limit);

  return res.status(200).json({
    success: true,
    meta,
    data: results,
  });
};

// GET /visitor
exports.getAllVisitors = async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query, 20, 100);

  const { search = "", blocked } = req.query;

  const whereClause = {};

  // Search by visitor ID
  if (search && search.trim().length > 0) {
    whereClause.id = { [Op.iLike]: `%${search}%` };
  }

  // Filter by block status
  if (blocked === "true") whereClause.isBlocked = true;
  if (blocked === "false") whereClause.isBlocked = false;

  const { count, rows } = await Visitor.findAndCountAll({
    attributes: [
      "id",
      "lastVisitedUrl",
      "firstSeen",
      "lastSeen",
      "isBlocked",
      "createdAt",
      "updatedAt",
    ],
    where: whereClause,
    limit,
    offset,
    order: [["createdAt", "DESC"]],
  });

  const meta = getMeta(count, page, limit);

  return res.status(200).json({
    success: true,
    meta,
    data: rows,
  });
};
