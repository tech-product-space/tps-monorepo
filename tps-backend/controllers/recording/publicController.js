const { Op } = require("sequelize");

const db = require("../../models");
const asyncWrapper = require("../../utils/asyncWrapper");
const { getMeta, getPaginationParams } = require("../../utils/pagination");
const {
  RECORDING_RELATED_LIMIT,
  resolveRecordingSettings,
} = require("../../constants/recording");

const { Recording, RecordingCategory } = db;

/**
 * Everything /recordings and /recordings/:slug are allowed to know.
 *
 * The rule this file exists to enforce: **`video.url` and `video.videoId` never
 * leave here while the recording is gated.** Shipping them in the page payload
 * and letting the frontend hide the iframe would put the link in view-source and
 * in the network tab, which makes the gate decorative and the conversion number
 * fiction. They are emitted by exactly one endpoint — the lead POST in
 * `leadController.js`.
 */

/** Live means published, and past any scheduled date it was given. */
const livePredicate = () => ({
  isPublished: true,
  [Op.or]: [{ scheduledAt: null }, { scheduledAt: { [Op.lte]: new Date() } }],
});

/** The listing card. Deliberately small — a grid must not ship page payloads. */
const CARD_ATTRS = [
  "id",
  "slug",
  "title",
  // The one line of prose the "keep exploring" sidebar shows under each title.
  "subtitle",
  "thumbnail",
  "durationMinutes",
  "categoryId",
  "format",
  // Not drawn on a card. It is the sitemap's `lastModified`, and the honest
  // alternative was stamping every recording with "changed just now" on every
  // regeneration — which trains crawlers to ignore the field.
  "publishedAt",
];

const toCard = (recording) => {
  const speaker = Array.isArray(recording.speakers)
    ? recording.speakers[0]
    : null;

  return {
    id: recording.id,
    slug: recording.slug,
    title: recording.title,
    subtitle: recording.subtitle,
    format: recording.format,
    thumbnail: recording.thumbnail,
    durationMinutes: recording.durationMinutes,
    categoryId: recording.categoryId,
    publishedAt: recording.publishedAt,
    speaker: speaker
      ? {
          name: speaker.name ?? null,
          title: speaker.title ?? null,
          company: speaker.company ?? null,
          // No `avatar`: the card's image is the recording's `thumbnail`. The
          // detail page gets the whole `speakers` array and can read it there.
        }
      : null,
  };
};

/** The chip row. */
const listPublicCategories = asyncWrapper(async (req, res) => {
  const categories = await RecordingCategory.findAll({
    where: { isActive: true },
    attributes: ["id", "name", "slug"],
    order: [
      ["order", "ASC"],
      ["name", "ASC"],
    ],
  });

  // No synthetic "All" row. The site prepends its own chip; a fake category in
  // the database would need excluding from every count and every filter.
  return res.status(200).json({ success: true, data: categories });
});

const listPublicRecordings = asyncWrapper(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query, 12);
  const { category, q } = req.query;

  const where = livePredicate();

  if (category) {
    const row = await RecordingCategory.findOne({
      where: { slug: category },
      attributes: ["id"],
    });

    // An unknown slug is an empty result, not a 404 — a retired chip in
    // somebody's bookmark should show "nothing here", not break the page.
    if (!row) {
      return res.status(200).json({
        success: true,
        data: [],
        meta: getMeta(0, page, limit),
      });
    }

    where.categoryId = row.id;
  }

  if (q) {
    where[Op.and] = [
      {
        // Title and subtitle only. `seo.description` is the meta text and is not
        // what somebody types into a search box.
        [Op.or]: [
          { title: { [Op.iLike]: `%${q}%` } },
          { subtitle: { [Op.iLike]: `%${q}%` } },
        ],
      },
    ];
  }

  const { rows, count } = await Recording.findAndCountAll({
    where,
    attributes: [...CARD_ATTRS, "speakers"],
    order: [["publishedAt", "DESC"]],
    limit,
    offset,
  });

  return res.status(200).json({
    success: true,
    data: rows.map(toCard),
    meta: getMeta(count, page, limit),
  });
});

/**
 * The "KEEP EXPLORING" sidebar.
 *
 * Manual picks first, in the order the admin chose. Anything missing — a pick
 * that has since been unpublished or deleted — is topped up from the same
 * category. The list is filtered at read time rather than maintained on write,
 * so deleting a recording never has to touch every row that referenced it.
 */
const resolveRelated = async (recording) => {
  const picked = Array.isArray(recording.relatedRecordingIds)
    ? recording.relatedRecordingIds
    : [];

  const found = picked.length
    ? await Recording.findAll({
        where: { ...livePredicate(), id: { [Op.in]: picked } },
        attributes: [...CARD_ATTRS, "speakers"],
      })
    : [];

  const byId = new Map(found.map((row) => [row.id, row]));
  const ordered = picked.map((id) => byId.get(id)).filter(Boolean);

  if (ordered.length >= RECORDING_RELATED_LIMIT) {
    return ordered.slice(0, RECORDING_RELATED_LIMIT).map(toCard);
  }

  const exclude = [recording.id, ...ordered.map((row) => row.id)];

  const fill = await Recording.findAll({
    where: {
      ...livePredicate(),
      id: { [Op.notIn]: exclude },
      ...(recording.categoryId ? { categoryId: recording.categoryId } : {}),
    },
    attributes: [...CARD_ATTRS, "speakers"],
    order: [["publishedAt", "DESC"]],
    limit: RECORDING_RELATED_LIMIT - ordered.length,
  });

  return [...ordered, ...fill].map(toCard);
};

const getPublicRecordingBySlug = asyncWrapper(async (req, res) => {
  /**
   * Staff holding an in-scope preview token see the recording as it will be;
   * everybody else sees exactly what they saw before. `previewAuth` has already
   * checked the token was minted for *this* slug.
   *
   * The live predicate is both gates at once — `isPublished`, and a
   * `scheduledAt` still in the future — and preview lifts both, because "does
   * the scheduled one look right" is one of the two things preview exists to
   * answer.
   */
  const previewing = Boolean(req.preview);

  const recording = await Recording.findOne({
    where: {
      slug: req.params.slug,
      ...(previewing ? {} : livePredicate()),
    },
    include: [
      {
        model: RecordingCategory,
        as: "category",
        attributes: ["id", "name", "slug"],
      },
    ],
  });

  if (!recording) {
    return res
      .status(404)
      .json({ success: false, message: "Recording not found" });
  }

  const settings = resolveRecordingSettings(recording);
  const isGated = Boolean(settings.gateVideo);

  return res.status(200).json({
    success: true,
    data: {
      /**
       * Preview only, and only ever additive.
       *
       * `isPreview` tells the page it may draw the exit pill; the two publish
       * fields are what that pill reads to say *why* the page is not public.
       * None of them appear in a public response, so nothing about the shape a
       * visitor gets changes.
       */
      ...(previewing
        ? {
            isPreview: true,
            isPublished: recording.isPublished,
            scheduledAt: recording.scheduledAt,
          }
        : {}),

      id: recording.id,
      slug: recording.slug,
      title: recording.title,
      subtitle: recording.subtitle,
      thumbnail: recording.thumbnail,
      format: recording.format,
      durationMinutes: recording.durationMinutes,
      category: recording.category,
      host: recording.host,
      speakers: recording.speakers,
      content: recording.content,
      seo: recording.seo,

      attendeeCount:
        settings.showAttendeeCount && recording.attendeeCount
          ? recording.attendeeCount
          : null,

      relatedRecordings: settings.showKeepExploring
        ? await resolveRelated(recording)
        : [],

      isGated,
      /**
       * Gated: the provider only, so the page can render the right player shell
       * without being told which video it is. Ungated: the whole block.
       */
      video: isGated
        ? { provider: recording.video?.provider ?? "youtube" }
        : recording.video,

      /**
       * The real video, handed over in preview even while the recording is
       * gated — under a separate key rather than by pretending it is ungated.
       *
       * The gate is left standing, because how it looks and reads is half of
       * what preview is opened to check. This sits beside it and offers a way
       * past that does not need a website account, does not write a lead row,
       * and does not count a view on a recording nobody can reach yet.
       *
       * The scope is what makes this safe to emit: it takes a staff-minted,
       * single-use link, redeemed within the hour, naming this exact slug.
       */
      ...(previewing && isGated ? { previewVideo: recording.video } : {}),
    },
  });
});

module.exports = {
  listPublicCategories,
  listPublicRecordings,
  getPublicRecordingBySlug,
};
