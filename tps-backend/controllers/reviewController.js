"use strict";

const { Op } = require("sequelize");
const db = require("../models");
const asyncWrapper = require("../utils/asyncWrapper");
const { getMeta, getPaginationParams } = require("../utils/pagination");
const { parseYouTubeVideoId } = require("../utils/youtube");

const { Review } = db;

const REVIEW_STATUSES = ["draft", "published", "unpublished"];

const REQUIRED_FIELDS = ["name", "role", "content", "linkedin_url"];
const OPTIONAL_FIELDS = [
  "avatar",
  "before_company",
  "before_designation",
  "before_logo",
  "after_company",
  "after_designation",
  "after_logo",
  "youtube_url",
];

const PUBLIC_ATTRIBUTES = [
  "id",
  "name",
  "role",
  "content",
  "linkedin_url",
  "avatar",
  "before_company",
  "before_designation",
  "before_logo",
  "after_company",
  "after_designation",
  "after_logo",
  "youtube_url",
];

const PUBLIC_ORDER = [
  ["display_order", "ASC"],
  ["createdAt", "DESC"],
];

const trimOrNull = (value) => {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text || null;
};

const isHttpUrl = (value) => {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
};

/**
 * Picks and validates the editable fields from a request body.
 *
 * `partial` is for updates: fields absent from the body are left alone, but a
 * required field that is present still has to be non-empty.
 */
const readReviewInput = (body, { partial = false } = {}) => {
  const values = {};
  const errors = [];

  for (const field of REQUIRED_FIELDS) {
    if (partial && body[field] === undefined) continue;
    const value = trimOrNull(body[field]);
    if (!value) errors.push(`${field} is required`);
    values[field] = value;
  }

  for (const field of OPTIONAL_FIELDS) {
    if (partial && body[field] === undefined) continue;
    values[field] = trimOrNull(body[field]);
  }

  if (values.linkedin_url && !isHttpUrl(values.linkedin_url)) {
    errors.push("linkedin_url must be a valid URL");
  }

  // Store what the admin pasted, but refuse a link the website cannot embed —
  // a bad URL would otherwise only show up as a broken player on the live page.
  if (values.youtube_url && !parseYouTubeVideoId(values.youtube_url)) {
    errors.push("youtube_url is not a recognisable YouTube link");
  }

  if (body.display_order !== undefined) {
    const order = Number.parseInt(body.display_order, 10);
    if (Number.isFinite(order)) values.display_order = order;
    else errors.push("display_order must be a number");
  }

  if (body.status !== undefined) {
    if (REVIEW_STATUSES.includes(body.status)) values.status = body.status;
    else errors.push(`status must be one of ${REVIEW_STATUSES.join(", ")}`);
  }

  return { values, errors };
};

// published_at records the first publish only, so unpublishing and
// republishing does not reshuffle anything sorted by it.
const withPublishedAt = (values, review) => {
  if (values.status === "published" && !review?.published_at) {
    return { ...values, published_at: new Date() };
  }
  return values;
};

/* ── admin ──────────────────────────────────────────────────────────────── */

const listReviews = asyncWrapper(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query, 20, 100);
  const { q, status } = req.query;

  const where = {};
  if (REVIEW_STATUSES.includes(status)) where.status = status;
  if (q) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${q}%` } },
      { role: { [Op.iLike]: `%${q}%` } },
      { content: { [Op.iLike]: `%${q}%` } },
    ];
  }

  const { rows, count } = await Review.findAndCountAll({
    where,
    limit,
    offset,
    order: PUBLIC_ORDER,
  });

  const counts = await Review.count({ group: ["status"] });
  const statusCounts = Object.fromEntries(REVIEW_STATUSES.map((s) => [s, 0]));
  for (const { status: s, count: n } of counts) statusCounts[s] = Number(n);

  return res.status(200).json({
    success: true,
    data: rows,
    meta: { ...getMeta(count, page, limit), statusCounts },
  });
});

const getReviewById = asyncWrapper(async (req, res) => {
  const review = await Review.findByPk(req.params.id);
  if (!review) {
    return res.status(404).json({ success: false, message: "Review not found" });
  }
  return res.status(200).json({ success: true, data: review });
});

const createReview = asyncWrapper(async (req, res) => {
  const { values, errors } = readReviewInput(req.body);
  if (errors.length) {
    return res.status(400).json({ success: false, message: errors.join(", "), errors });
  }

  // New reviews go to the end of the page unless an order was given.
  if (values.display_order === undefined) {
    const maxOrder = await Review.max("display_order");
    values.display_order = (Number.isFinite(maxOrder) ? maxOrder : 0) + 1;
  }

  const review = await Review.create(withPublishedAt(values));
  return res.status(201).json({ success: true, data: review });
});

const updateReview = asyncWrapper(async (req, res) => {
  const review = await Review.findByPk(req.params.id);
  if (!review) {
    return res.status(404).json({ success: false, message: "Review not found" });
  }

  const { values, errors } = readReviewInput(req.body, { partial: true });
  if (errors.length) {
    return res.status(400).json({ success: false, message: errors.join(", "), errors });
  }

  await review.update(withPublishedAt(values, review));
  return res.status(200).json({ success: true, data: review });
});

const updateReviewStatus = asyncWrapper(async (req, res) => {
  const { status } = req.body;
  if (!REVIEW_STATUSES.includes(status)) {
    return res.status(400).json({
      success: false,
      message: `status must be one of ${REVIEW_STATUSES.join(", ")}`,
    });
  }

  const review = await Review.findByPk(req.params.id);
  if (!review) {
    return res.status(404).json({ success: false, message: "Review not found" });
  }

  await review.update(withPublishedAt({ status }, review));
  return res.status(200).json({ success: true, data: review });
});

const deleteReview = asyncWrapper(async (req, res) => {
  const deleted = await Review.destroy({ where: { id: req.params.id } });
  if (!deleted) {
    return res.status(404).json({ success: false, message: "Review not found" });
  }
  return res.status(200).json({ success: true, message: "Review deleted successfully" });
});

/* ── public ─────────────────────────────────────────────────────────────── */

const listPublicReviews = asyncWrapper(async (req, res) => {
  const reviews = await Review.findAll({
    where: { status: "published" },
    attributes: PUBLIC_ATTRIBUTES,
    order: PUBLIC_ORDER,
  });
  return res.status(200).json({ success: true, data: reviews });
});

module.exports = {
  REVIEW_STATUSES,
  listReviews,
  getReviewById,
  createReview,
  updateReview,
  updateReviewStatus,
  deleteReview,
  listPublicReviews,
};
