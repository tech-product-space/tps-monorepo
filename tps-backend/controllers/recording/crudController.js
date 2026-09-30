const { Op } = require("sequelize");

const db = require("../../models");
const asyncWrapper = require("../../utils/asyncWrapper");
const { getMeta, getPaginationParams } = require("../../utils/pagination");
const { buildVideoBlock } = require("../../utils/youtube");
const {
  RECORDING_CONTENT_KEY_LIST,
  RECORDING_RELATED_LIMIT,
} = require("../../constants/recording");

const { Recording, RecordingCategory, RecordingLead } = db;

/**
 * JSONB blocks are merged one key deep on update, never replaced.
 *
 * The reason: a form that posts one block must not be able to blank the others.
 * The consequence the admin panel has to know about is the mirror image — a
 * block the form *omits* is preserved, so clearing every bullet from a list
 * means sending that key as an empty string, not leaving it out. Sending the
 * whole object every time is the rule on the panel side.
 */
const mergeBlock = (existing, incoming) => {
  if (incoming === undefined) return existing;
  if (incoming === null) return {};

  return { ...(existing ?? {}), ...incoming };
};

/** Drops content keys nothing knows about, so the column cannot drift. */
const sanitiseContent = (existing, incoming) => {
  const merged = mergeBlock(existing, incoming);

  return Object.fromEntries(
    Object.entries(merged).filter(([key]) =>
      RECORDING_CONTENT_KEY_LIST.includes(key)
    )
  );
};

const CATEGORY_ATTRS = ["id", "name", "slug"];

/** Everything the admin list needs to draw a row, and nothing more. */
const LIST_ATTRS = [
  "id",
  "slug",
  "title",
  "thumbnail",
  "durationMinutes",
  "categoryId",
  "format",
  "isPublished",
  "publishedAt",
  "viewCount",
  "createdAt",
  "updatedAt",
];

/**
 * Sorts the admin list offers.
 *
 * Whitelisted rather than passed through: an `order` built from a query string
 * is a column name the caller chooses, and Sequelize will happily quote one that
 * does not exist into a 500. Anything unrecognised falls back to `recent`.
 *
 * Leads is deliberately absent — the count comes from a separate grouped query
 * below, so ordering by it would mean sorting a page that was already chosen.
 */
const LIST_SORTS = {
  // Drafts have no publishedAt, so they would sink to the bottom of a plain
  // publishedAt sort — the wrong end of the list for the rows an admin is most
  // likely still working on.
  recent: [
    ["publishedAt", "DESC NULLS FIRST"],
    ["createdAt", "DESC"],
  ],
  oldest: [["createdAt", "ASC"]],
  title: [["title", "ASC"]],
  views: [
    ["viewCount", "DESC"],
    ["createdAt", "DESC"],
  ],
  longest: [
    ["durationMinutes", "DESC NULLS LAST"],
    ["createdAt", "DESC"],
  ],
};


const listRecordings = asyncWrapper(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);
  const { q, categoryId, isPublished, format, sort } = req.query;

  const where = {};

  if (categoryId) where.categoryId = categoryId;
  if (isPublished === "true") where.isPublished = true;
  if (isPublished === "false") where.isPublished = false;
  if (format) where.format = format;

  if (q) {
    where[Op.or] = [
      { title: { [Op.iLike]: `%${q}%` } },
      { subtitle: { [Op.iLike]: `%${q}%` } },
      { slug: { [Op.iLike]: `%${q}%` } },
    ];
  }

  const { rows, count } = await Recording.findAndCountAll({
    where,
    attributes: LIST_ATTRS,
    include: [
      { model: RecordingCategory, as: "category", attributes: CATEGORY_ATTRS },
    ],
    // hasOwn, not a bare lookup: `sort=constructor` would otherwise hand
    // Sequelize the Object constructor and 500 the list.
    order: Object.hasOwn(LIST_SORTS, sort ?? "")
      ? LIST_SORTS[sort]
      : LIST_SORTS.recent,
    limit,
    offset,
    distinct: true,
  });

  // One grouped count rather than a per-row subquery: the list is the screen an
  // admin leaves open, and N+1 on lead counts is what makes it feel slow.
  const leadCounts = rows.length
    ? await RecordingLead.findAll({
        attributes: [
          "recordingId",
          [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
        ],
        where: { recordingId: { [Op.in]: rows.map((r) => r.id) } },
        group: ["recordingId"],
        raw: true,
      })
    : [];

  const countByRecording = Object.fromEntries(
    leadCounts.map((row) => [row.recordingId, Number(row.count)])
  );

  return res.status(200).json({
    success: true,
    data: rows.map((row) => ({
      ...row.toJSON(),
      leadCount: countByRecording[row.id] ?? 0,
    })),
    meta: getMeta(count, page, limit),
  });
});

const getRecordingById = asyncWrapper(async (req, res) => {
  const recording = await Recording.findByPk(req.params.id, {
    include: [
      { model: RecordingCategory, as: "category", attributes: CATEGORY_ATTRS },
    ],
  });

  if (!recording) {
    return res
      .status(404)
      .json({ success: false, message: "Recording not found" });
  }

  // The editor shows the same split as the list, so it must not have to count
  // the leads itself to get it.
  const leadCount = await RecordingLead.count({
    where: { recordingId: recording.id },
  });

  return res.status(200).json({
    success: true,
    data: {
      ...recording.toJSON(),
      leadCount,
    },
  });
});

const checkSlugAvailability = asyncWrapper(async (req, res) => {
  const { slug, excludeId } = req.query;

  if (!slug) {
    return res
      .status(400)
      .json({ success: false, message: "slug is required" });
  }

  const where = { slug };
  if (excludeId) where.id = { [Op.ne]: excludeId };

  const existing = await Recording.findOne({ where, attributes: ["id"] });

  return res
    .status(200)
    .json({ success: true, data: { available: !existing } });
});

/** Fields a client may set. `viewCount` is deliberately absent. */
const pickWritable = (body) => ({
  slug: body.slug,
  title: body.title,
  subtitle: body.subtitle,
  categoryId: body.categoryId,
  thumbnail: body.thumbnail,
  durationMinutes: body.durationMinutes,
  attendeeCount: body.attendeeCount,
  format: body.format,
  scheduledAt: body.scheduledAt,
});

const withoutUndefined = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));

/** Trims the manual "keep exploring" picks to what the sidebar can show. */
const normaliseRelated = (ids, selfId) => {
  if (!Array.isArray(ids)) return undefined;

  return [...new Set(ids.filter(Boolean))]
    .filter((id) => id !== selfId)
    .slice(0, RECORDING_RELATED_LIMIT);
};

const createRecording = asyncWrapper(async (req, res) => {
  const { title, categoryId } = req.body;

  if (!title) {
    return res
      .status(400)
      .json({ success: false, message: "Title is required" });
  }

  /**
   * Category is required at creation, though the column stays nullable.
   *
   * The two are not in conflict: deleting a category is `ON DELETE SET NULL`, so
   * an existing recording can legitimately end up uncategorised and must still
   * load and still be editable. What must not happen is a *new* recording being
   * filed nowhere — the chip row is the only way anybody browses this section,
   * so an uncategorised recording is one nobody will find.
   */
  if (!categoryId) {
    return res
      .status(400)
      .json({ success: false, message: "Category is required" });
  }

  const category = await RecordingCategory.findByPk(categoryId, {
    attributes: ["id"],
  });

  if (!category) {
    return res
      .status(400)
      .json({ success: false, message: "That category does not exist" });
  }

  const video = buildVideoBlock(req.body.video, {});

  if (!video.ok) {
    return res.status(400).json({ success: false, message: video.message });
  }

  const recording = await Recording.create({
    ...withoutUndefined(pickWritable(req.body)),
    title,
    video: video.value,
    host: req.body.host ?? {},
    speakers: Array.isArray(req.body.speakers) ? req.body.speakers : [],
    content: sanitiseContent({}, req.body.content),
    relatedRecordingIds: normaliseRelated(req.body.relatedRecordingIds) ?? [],
    seo: req.body.seo ?? {},
    settings: req.body.settings ?? {},
  });

  return res.status(201).json({ success: true, data: recording });
});

const updateRecording = asyncWrapper(async (req, res) => {
  const recording = await Recording.findByPk(req.params.id);

  if (!recording) {
    return res
      .status(404)
      .json({ success: false, message: "Recording not found" });
  }

  const video = buildVideoBlock(req.body.video, recording.video);

  if (!video.ok) {
    return res.status(400).json({ success: false, message: video.message });
  }

  const related = normaliseRelated(req.body.relatedRecordingIds, recording.id);

  const updates = withoutUndefined({
    ...pickWritable(req.body),
    video: video.value,
    host: mergeBlock(recording.host, req.body.host),
    // Arrays replace wholesale — merging two lists of speakers by index is
    // never what anybody means by an edit.
    speakers: Array.isArray(req.body.speakers) ? req.body.speakers : undefined,
    content: sanitiseContent(recording.content, req.body.content),
    relatedRecordingIds: related,
    seo: mergeBlock(recording.seo, req.body.seo),
    settings: mergeBlock(recording.settings, req.body.settings),
  });

  await recording.update(updates);

  return res.status(200).json({ success: true, data: recording });
});

const toggleRecordingStatus = asyncWrapper(async (req, res) => {
  const recording = await Recording.findByPk(req.params.id);

  if (!recording) {
    return res
      .status(404)
      .json({ success: false, message: "Recording not found" });
  }

  const nextPublished = !recording.isPublished;

  // A recording with no video is a page with a gate and nothing behind it.
  // Refused at the one moment it becomes visible, rather than on every save —
  // a draft is allowed to be incomplete.
  if (nextPublished && !recording.video?.videoId) {
    return res.status(400).json({
      success: false,
      message: "Add a YouTube link before publishing this recording.",
    });
  }

  await recording.update({
    isPublished: nextPublished,
    // Stamped on first publish only. Re-publishing something that was pulled
    // down must not move it back to the top of the grid as though it were new.
    publishedAt: recording.publishedAt ?? (nextPublished ? new Date() : null),
  });

  return res.status(200).json({
    success: true,
    data: recording,
    isPublished: recording.isPublished,
  });
});

const deleteRecording = asyncWrapper(async (req, res) => {
  const recording = await Recording.findByPk(req.params.id);

  if (!recording) {
    return res
      .status(404)
      .json({ success: false, message: "Recording not found" });
  }

  await recording.destroy();

  return res
    .status(200)
    .json({ success: true, message: "Recording deleted successfully" });
});

module.exports = {
  listRecordings,
  getRecordingById,
  checkSlugAvailability,
  createRecording,
  updateRecording,
  toggleRecordingStatus,
  deleteRecording,
};
