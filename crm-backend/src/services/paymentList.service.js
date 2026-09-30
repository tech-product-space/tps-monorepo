const { Op, fn, col, literal } = require("sequelize");
const {
  Payment,
  PaymentLink,
  PaymentAttachment,
  LeadProfile,
  LeadCourse,
  User,
} = require("../models");
const {
  PAYMENT_STATUS,
  VERIFICATION_STATUS,
} = require("../config/constants/payment");
const { getScopedUserIds } = require("../utils/dashboardScope");
const { parsePagination, buildPage } = require("../utils/pagination");
const proofStorage = require("./paymentProof.storage");
const { getOnboardingEligibilityMap } = require("./emailTemplate.service");


/**
 * DROPPED ENROLLMENTS ARE DELIBERATELY INCLUDED in the payments list.
 *
 * The payments themselves are unaffected by a drop, and hiding them would make
 * the list stop reconciling with the revenue figures on the dashboard.
 */
/**
 * The global, payment-row-centric list behind the Payments page.
 *
 * Distinct from the other money screens by its pivot: Enrollments is
 * enrollment-centric and Invoices invoice-centric, both fetching everything and
 * paginating in the browser. This one is a payment per row, paginated and
 * filtered server-side, because payment rows outnumber both.
 */

/**
 * Chip → predicate. Defined once here so the UI's chips can never drift from
 * the query that backs them; the client sends a chip name, not a status guess.
 */
const VIEWS = Object.freeze({
  all: () => ({}),
  awaiting: () => ({ verification_status: VERIFICATION_STATUS.PENDING }),
  verified: () => ({ status: PAYMENT_STATUS.PAID }),
  // A live gateway link the customer hasn't paid. Manual payments awaiting
  // approval are also status='pending', hence the NULL check.
  pending_link: () => ({
    status: PAYMENT_STATUS.PENDING,
    verification_status: null,
  }),
  rejected: () => ({ verification_status: VERIFICATION_STATUS.REJECTED }),
  // Withdrawn by the recorder before anyone verified it. Needs its own chip
  // rather than folding into `failed`: that chip is gateway wreckage (declines,
  // expiries, cancelled links) and is scoped to verification_status IS NULL, so
  // these rows would otherwise be reachable from `all` and nowhere else.
  cancelled: () => ({ verification_status: VERIFICATION_STATUS.CANCELLED }),
  failed: () => ({
    status: {
      [Op.in]: [PAYMENT_STATUS.FAILED, PAYMENT_STATUS.EXPIRED, PAYMENT_STATUS.CANCELLED],
    },
    verification_status: null,
  }),
});

const VIEW_KEYS = Object.keys(VIEWS);

const LIST_ATTRIBUTES = [
  "id",
  "amount",
  "currency",
  "base_amount",
  "description",
  "note",
  "source",
  "reference",
  "status",
  "verification_status",
  "verified_at",
  "rejection_reason",
  "supersedes_payment_id",
  "paid_at",
  "created_at",
  "created_by",
  "lead_profile_id",
  "lead_course_id",
  "expire_by",
];

/**
 * belongsTo/hasOne only — all 1:1, so they combine safely with limit/offset in a
 * single flat query and let the `$LeadProfile.name$` search reference the join.
 * Attachments are hasMany and are fetched separately (see attachProofs).
 */
function buildIncludes({ courseRequired, courseWhere }) {
  return [
    {
      model: User,
      as: "Creator",
      attributes: ["id", "name"],
      required: false,
    },
    {
      model: User,
      as: "Verifier",
      attributes: ["id", "name"],
      required: false,
    },
    {
      model: LeadProfile,
      as: "LeadProfile",
      // country_code so the phone renders as "+91 98765…" like every other list.
      attributes: ["id", "name", "phone", "email", "country_code"],
      required: false,
    },
    {
      model: LeadCourse,
      as: "LeadCourse",
      // cohort_name is snapshotted onto lead_courses at enroll time, so the
      // display name needs no join to `cohorts` and survives a later rename.
      attributes: [
        "id",
        "program_name",
        "course_id",
        "cohort_id",
        "cohort_name",
        "final_fee",
        "currency",
        "owner_agent_id",
        // Drives the "enrollment dropped" marker on the payments list. The rows
        // themselves are deliberately NOT filtered by it — the money arrived and
        // still counts (design §3.4-C); the marker just explains why an
        // enrollment nobody is chasing has payments against it.
        "status",
      ],
      // Only INNER JOIN when a filter actually lives on the enrollment —
      // otherwise standalone payments would silently vanish from the list.
      required: courseRequired,
      where: courseWhere,
    },
    {
      model: PaymentLink,
      as: "Link",
      attributes: ["provider", "url", "status", "expire_by", "provider_ref"],
      required: false,
    },
  ];
}

/**
 * Everything except the chip predicate. Kept separate so the chip counts can
 * reuse it — a chip's count must respect the other filters but not itself, or
 * selecting one chip would zero out all the others.
 */
async function buildBaseQuery(user, filters = {}) {
  const where = {};

  // Scope: you see what you recorded. Managers see their team's, Superadmin and
  // Program Manager see everything. Matches the verification queue exactly, so
  // the two views never disagree.
  const scopedUserIds = await getScopedUserIds(user);
  if (scopedUserIds !== null) {
    where.created_by = { [Op.in]: scopedUserIds };
  }

  const agentIds = (filters.agentIds || [])
    .filter(Boolean)
    .map((id) => String(id).toLowerCase());
  if (agentIds.length) {
    // Intersect with the role scope rather than replacing it.
    where.created_by = scopedUserIds
      ? { [Op.in]: agentIds.filter((id) => scopedUserIds.includes(id)) }
      : { [Op.in]: agentIds };
  }

  if (filters.source) where.source = filters.source;
  if (filters.currency) where.currency = filters.currency;

  // Which date the range applies to: when the money arrived, or when it was
  // keyed in. They differ for back-dated entries, and both are worth filtering.
  const dateField = filters.dateField === "created_at" ? "created_at" : "paid_at";
  if (filters.from || filters.to) {
    where[dateField] = {};
    if (filters.from) where[dateField][Op.gte] = new Date(filters.from);
    if (filters.to) {
      const to = new Date(filters.to);
      to.setHours(23, 59, 59, 999);
      where[dateField][Op.lte] = to;
    }
  }

  const min = Number(filters.minAmount);
  const max = Number(filters.maxAmount);
  if (Number.isFinite(min) || Number.isFinite(max)) {
    where.amount = {};
    if (Number.isFinite(min)) where.amount[Op.gte] = min;
    if (Number.isFinite(max)) where.amount[Op.lte] = max;
  }

  const q = (filters.q || "").trim();
  if (q) {
    where[Op.or] = [
      { reference: { [Op.iLike]: `%${q}%` } },
      { description: { [Op.iLike]: `%${q}%` } },
      { "$LeadProfile.name$": { [Op.iLike]: `%${q}%` } },
      { "$LeadProfile.phone$": { [Op.iLike]: `%${q}%` } },
    ];
  }

  // Enrollment-side filters. These force the INNER JOIN.
  const courseWhere = {};
  const cohortIds = (filters.cohortIds || []).filter(Boolean);
  if (cohortIds.length) courseWhere.cohort_id = { [Op.in]: cohortIds };
  if (filters.courseId) courseWhere.course_id = filters.courseId;

  const courseRequired = Object.keys(courseWhere).length > 0;

  return {
    where,
    include: buildIncludes({
      courseRequired,
      courseWhere: courseRequired ? courseWhere : undefined,
    }),
    // True when the query cannot, by construction, return standalone payments.
    excludesStandalone: courseRequired,
  };
}

function resolveView(view) {
  return VIEW_KEYS.includes(view) ? view : "all";
}

/** Merge the chip predicate into the base where without clobbering Op.or. */
function withView(baseWhere, view) {
  return { ...baseWhere, ...VIEWS[resolveView(view)]() };
}

/**
 * Presign proof files for a page of rows. Signing is local HMAC — no network
 * round-trip — so a whole page is cheap, and it lets the client render
 * thumbnails without a second request per row.
 */
async function attachProofs(rows) {
  if (!rows.length) return rows;

  const attachments = await PaymentAttachment.findAll({
    where: { payment_id: { [Op.in]: rows.map((r) => r.id) } },
    attributes: ["id", "payment_id", "file_key", "file_name", "mime_type", "size_bytes"],
    order: [["created_at", "ASC"]],
    raw: true,
  });

  const byPayment = new Map();
  await Promise.all(
    attachments.map(async (a) => {
      let previewUrl = null;
      try {
        previewUrl = await proofStorage.signedUrl({
          key: a.file_key,
          fileName: a.file_name,
          mimeType: a.mime_type,
        });
      } catch (err) {
        // One broken object must not take down the whole page.
        console.error("Failed to sign payment proof", a.id, err.message);
      }

      const list = byPayment.get(a.payment_id) || [];
      list.push({
        id: a.id,
        file_name: a.file_name,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
        preview_url: previewUrl,
      });
      byPayment.set(a.payment_id, list);
    }),
  );

  return rows.map((row) => ({ ...row, attachments: byPayment.get(row.id) || [] }));
}

function shapeRow(instance) {
  const row = instance.toJSON();
  const link = row.Link;

  return {
    ...row,
    creator: row.Creator || null,
    verified_by_name: row.Verifier?.name || null,
    profile: row.LeadProfile || null,
    course: row.LeadCourse || null,
    cohort_name: row.LeadCourse?.cohort_name || null,
    paymentLink: link?.url
      ? {
          provider: link.provider,
          short_url: link.url,
          status: link.status,
          expire_by: link.expire_by,
          provider_ref: link.provider_ref || null,
        }
      : null,
  };
}

const SORTABLE = { paid_at: "paid_at", created_at: "created_at", amount: "amount" };

function resolveOrder(sort, dir) {
  const column = SORTABLE[sort] || "paid_at";
  const direction = String(dir).toLowerCase() === "asc" ? "ASC" : "DESC";
  // paid_at is null for an unpaid link; keep those out of the way of real money
  // rather than letting them head the list.
  return [
    [literal(`"Payment"."${column}" ${direction} NULLS LAST`)],
    ["created_at", "DESC"],
  ];
}

/**
 * Per-chip counts. Deliberately ignores the active chip so switching chips does
 * not reshuffle the other numbers — one grouped aggregate, not six queries.
 */
async function getViewCounts({ where, include }) {
  const countIf = (predicate, alias) => [
    fn("COUNT", literal(`CASE WHEN ${predicate} THEN 1 END`)),
    alias,
  ];

  const P = '"Payment"';
  const [row] = await Payment.findAll({
    where,
    include: include.map((i) => ({ ...i, attributes: [] })),
    attributes: [
      [fn("COUNT", col("Payment.id")), "all"],
      countIf(`${P}.verification_status = '${VERIFICATION_STATUS.PENDING}'`, "awaiting"),
      countIf(`${P}.status = '${PAYMENT_STATUS.PAID}'`, "verified"),
      countIf(
        `${P}.status = '${PAYMENT_STATUS.PENDING}' AND ${P}.verification_status IS NULL`,
        "pending_link",
      ),
      countIf(`${P}.verification_status = '${VERIFICATION_STATUS.REJECTED}'`, "rejected"),
      countIf(`${P}.verification_status = '${VERIFICATION_STATUS.CANCELLED}'`, "cancelled"),
      countIf(
        `${P}.status IN ('${PAYMENT_STATUS.FAILED}','${PAYMENT_STATUS.EXPIRED}','${PAYMENT_STATUS.CANCELLED}') AND ${P}.verification_status IS NULL`,
        "failed",
      ),
    ],
    raw: true,
    subQuery: false,
  });

  return VIEW_KEYS.reduce((acc, key) => {
    acc[key] = Number(row?.[key]) || 0;
    return acc;
  }, {});
}

/**
 * Money totals over the whole filtered set (not just the page), split by
 * currency so a mixed-currency org never sees rupees added to dollars.
 */
async function getSummary({ where, include }) {
  const P = '"Payment"';
  // Sum the NATIVE amount, not base_amount. The rows are grouped by currency and
  // the UI formats each bucket with that currency's symbol, so summing the INR
  // equivalent here would render rupees behind a dollar sign.
  const sumIf = (predicate, alias) => [
    fn("SUM", literal(`CASE WHEN ${predicate} THEN ${P}.amount ELSE 0 END`)),
    alias,
  ];

  const rows = await Payment.findAll({
    where,
    include: include.map((i) => ({ ...i, attributes: [] })),
    attributes: [
      "currency",
      sumIf(`${P}.status = '${PAYMENT_STATUS.PAID}'`, "collected"),
      sumIf(`${P}.verification_status = '${VERIFICATION_STATUS.PENDING}'`, "awaiting"),
      sumIf(
        `${P}.status = '${PAYMENT_STATUS.PENDING}' AND ${P}.verification_status IS NULL`,
        "pending_links",
      ),
      sumIf(`${P}.verification_status = '${VERIFICATION_STATUS.REJECTED}'`, "rejected"),
    ],
    group: [`${P}.currency`],
    raw: true,
    subQuery: false,
  });

  return rows.reduce((acc, r) => {
    acc[r.currency || "INR"] = {
      collected: Number(r.collected) || 0,
      awaiting: Number(r.awaiting) || 0,
      pendingLinks: Number(r.pending_links) || 0,
      rejected: Number(r.rejected) || 0,
    };
    return acc;
  }, {});
}

/** One page of payments, plus the chip counts and money totals behind it. */
async function listPayments({ user, filters = {}, query = {} }) {
  const { page, limit, offset } = parsePagination(query);
  const base = await buildBaseQuery(user, filters);
  const view = resolveView(filters.view);

  const { rows, count } = await Payment.findAndCountAll({
    where: withView(base.where, view),
    attributes: LIST_ATTRIBUTES,
    include: base.include,
    order: resolveOrder(filters.sort, filters.dir),
    limit,
    offset,
    subQuery: false,
  });

  const shaped = rows.map(shapeRow);

  const [withProofs, counts, summary] = await Promise.all([
    attachProofs(shaped),
    getViewCounts(base),
    getSummary(base),
  ]);

  // The Review action on this page opens the same verify modal as the queue, so
  // it needs the same warning: approving this also mails the customer.
  const eligibility = await getOnboardingEligibilityMap(
    shaped
      .filter((r) => r.verification_status === VERIFICATION_STATUS.PENDING)
      .map((r) => ({
        leadCourseId: r.lead_course_id,
        courseId: r.course?.course_id,
        email: r.profile?.email,
      })),
  );

  const flagged = withProofs.map((r) => ({
    ...r,
    willSendOnboarding: Boolean(
      r.verification_status === VERIFICATION_STATUS.PENDING &&
        r.lead_course_id &&
        eligibility[String(r.lead_course_id)],
    ),
  }));

  return buildPage({ rows: flagged, count, page, limit }, {
    view,
    counts,
    summary,
    excludesStandalone: base.excludesStandalone,
  });
}

/**
 * The same query, unpaginated, for CSV export. Hard-capped rather than
 * unbounded — a runaway export would pin the database and the Node process.
 */
const EXPORT_LIMIT = 10000;

async function listPaymentsForExport({ user, filters = {} }) {
  const base = await buildBaseQuery(user, filters);

  const rows = await Payment.findAll({
    where: withView(base.where, resolveView(filters.view)),
    attributes: LIST_ATTRIBUTES,
    include: base.include,
    order: resolveOrder(filters.sort, filters.dir),
    limit: EXPORT_LIMIT + 1,
    subQuery: false,
  });

  const truncated = rows.length > EXPORT_LIMIT;
  if (truncated) {
    console.warn(`Payment export truncated at ${EXPORT_LIMIT} rows for user ${user.id}`);
  }

  return {
    rows: rows.slice(0, EXPORT_LIMIT).map(shapeRow),
    truncated,
  };
}

module.exports = {
  listPayments,
  listPaymentsForExport,
  VIEW_KEYS,
  EXPORT_LIMIT,
};
