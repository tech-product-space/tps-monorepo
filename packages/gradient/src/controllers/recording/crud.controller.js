import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { getMeta, getPaginationParams } from "../../util/helpers/pagination.js";
import { buildChanges, snapshot } from "../../util/helpers/activityDiff.js";
import { buildVideoBlock } from "../../util/helpers/youtube.js";
import {
  RECORDING_CONTENT_KEY_LIST,
  RECORDING_RELATED_LIMIT,
} from "../../config/constants/recording.js";

const { Recording, RecordingCategory, RecordingLead } = db;

/**
 * JSONB blocks are merged one key deep on update, never replaced.
 *
 * The repo-wide reason: a form that posts one block must not be able to blank
 * the others. The consequence the admin panel has to know about is the mirror
 * image — a block the form *omits* is preserved, so clearing every bullet from
 * a list means sending that key as `[]`, not leaving it out. Sending the whole
 * object every time is the rule on the panel side.
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
      RECORDING_CONTENT_KEY_LIST.includes(key),
    ),
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
 * is a column name an attacker chooses, and Sequelize will happily quote one
 * that does not exist into a 500. Anything unrecognised falls back to `recent`.
 *
 * Leads is deliberately absent — the count comes from a separate grouped query
 * below, so ordering by it would mean sorting a page that was already chosen.
 * Sorting by something the page does not contain is worse than not offering it.
 */
const LIST_SORTS = {
  // Drafts have no publishedAt, so they would sink to the bottom of a plain
  // publishedAt sort — which is the wrong end of the list for the rows an
  // admin is most likely still working on.
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

export const listRecordings = asyncWrapper(async (req, res) => {
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
    // hasOwn, not a bare lookup: 'sort=constructor' would otherwise hand
    // Sequelize the Object constructor and 500 the list.
    order: Object.hasOwn(LIST_SORTS, sort ?? '') ? LIST_SORTS[sort] : LIST_SORTS.recent,
    limit,
    offset,
    distinct: true,
  });

  const leadCounts = await resolveLeadCounts(rows.map((r) => r.id));

  return res.status(200).json({
    success: true,
    data: rows.map((row) => ({
      ...row.toJSON(),
      leadCount: leadCounts[row.id] ?? 0,
    })),
    meta: getMeta(count, page, limit),
  });
});

/**
 * How many people watched each of these recordings.
 *
 * **People, not plays.** `RecordingLeads` holds one row per (recording,
 * person) — the unique index enforces it and no endpoint deletes one — so
 * counting rows counts distinct viewers. Somebody who opens a recording ten
 * times, on four devices, is one.
 *
 * That makes this the only viewing number the panel shows, and `viewCount` on
 * the row is not it. `viewCount` counts gate passes: it tracked repeats
 * meaningfully only while the gate reappeared on every new device, and the
 * per-account unlock ended that, so it now moves in lockstep with this count on
 * anything recent while carrying historical inflation on older rows. It is left
 * on the model as the record of what happened under the old behaviour and is
 * rendered nowhere.
 *
 * There was briefly a first-timer/returning split here, keyed on `userId`. It
 * was removed on 27 Aug 2026 in favour of one honest number — see
 * `../RECORDINGS_PLAN.md` §19.
 *
 * One grouped query for the whole page rather than a subquery per row: the list
 * is the screen an admin leaves open, and N+1 on this is what makes it feel
 * slow.
 */
const resolveLeadCounts = async (recordingIds) => {
  if (!recordingIds.length) return {};

  const rows = await RecordingLead.findAll({
    attributes: [
      "recordingId",
      [db.sequelize.fn("COUNT", db.sequelize.col("id")), "count"],
    ],
    where: { recordingId: { [Op.in]: recordingIds } },
    group: ["recordingId"],
    raw: true,
  });

  return Object.fromEntries(rows.map((r) => [r.recordingId, Number(r.count)]));
};

export const getRecordingById = asyncWrapper(async (req, res) => {
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

  // The same count as the list, by the same code path, so the two screens
  // cannot disagree about a number an admin will compare across them.
  const leadCounts = await resolveLeadCounts([recording.id]);

  return res.status(200).json({
    success: true,
    data: {
      ...recording.toJSON(),
      leadCount: leadCounts[recording.id] ?? 0,
    },
  });
});

export const checkSlugAvailability = asyncWrapper(async (req, res) => {
  const { slug, excludeId } = req.query;

  if (!slug) {
    return res.status(400).json({ success: false, message: "slug is required" });
  }

  const where = { slug };
  if (excludeId) where.id = { [Op.ne]: excludeId };

  const existing = await Recording.findOne({ where, attributes: ["id"] });

  return res.status(200).json({ success: true, data: { available: !existing } });
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

export const createRecording = asyncWrapper(async (req, res) => {
  const { title, categoryId } = req.body;

  if (!title) {
    return res.status(400).json({ success: false, message: "Title is required" });
  }

  /**
   * Category is required at creation, though the column stays nullable.
   *
   * The two are not in conflict: deleting a category is `ON DELETE SET NULL`,
   * so an existing recording can legitimately end up uncategorised and must
   * still load. What must not happen is a *new* recording being filed nowhere
   * — the chip row is the only way anybody browses this section, so an
   * uncategorised recording is one nobody will find.
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

/** The columns worth a field-level diff on the activity feed. */
const DIFF_FIELDS = [
  "title",
  "slug",
  "categoryId",
  "format",
  "durationMinutes",
  "attendeeCount",
  "video",
  "content",
  "settings",
];

export const updateRecording = asyncWrapper(async (req, res) => {
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

  const before = snapshot(recording, DIFF_FIELDS);

  await recording.update(updates);

  req.activity?.set({
    entityLabel: recording.title,
    changes: buildChanges(before, snapshot(recording, DIFF_FIELDS)),
  });

  return res.status(200).json({ success: true, data: recording });
});

export const toggleRecordingStatus = asyncWrapper(async (req, res) => {
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

  req.activity?.set({ entityLabel: recording.title });

  return res.status(200).json({
    success: true,
    data: recording,
    isPublished: recording.isPublished,
  });
});

export const deleteRecording = asyncWrapper(async (req, res) => {
  const recording = await Recording.findByPk(req.params.id);

  if (!recording) {
    return res
      .status(404)
      .json({ success: false, message: "Recording not found" });
  }

  // Captured before the row goes — the activity log's automatic lookup cannot
  // run once it is gone.
  req.activity?.set({ entityLabel: recording.title });

  await recording.destroy();

  return res
    .status(200)
    .json({ success: true, message: "Recording deleted successfully" });
});


