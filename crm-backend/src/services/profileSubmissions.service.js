const { Op, literal } = require("sequelize");
const {
  sequelize,
  LeadProfile,
  LeadProfileDetails,
  LeadCourse,
} = require("../models");

const { ENROLLMENT_STATUS } = require("../config/constants/enrollment");
const {
  CAREER_STATUSES,
  CAREER_STATUS_LABELS,
  GENDERS,
  GENDER_LABELS,
  GENDER_OPTIONS,
  TARGET_ROLE_LABELS,
  TARGET_ROLE_OPTIONS,
  TARGET_ROLE_VALUES,
  HEARD_ABOUT_OPTIONS,
  HEARD_ABOUT_VALUES,
  LIMITS,
} = require("../config/constants/onboarding");
const { parsePagination, buildPage } = require("../utils/pagination");
const { completionPercent } = require("./onboardingPortal.service");

/**
 * The Student Profiles screen — every answer collected at
 * onboarding.theproductspace.in, in one filterable list, plus a CSV extract.
 *
 * See PROFILE_SUBMISSIONS_PLAN.md. Two things to know before editing:
 *
 *  1. ONE ROW PER PERSON, ALWAYS. Programme and cohort filters are applied as a
 *     subquery against lead_courses, never as a `required: true` include. A
 *     student on two active programmes would otherwise appear twice in the list
 *     AND be counted twice in `total` — and `total` is the number somebody
 *     reports upward.
 *
 *  2. Two views, not three. `submitted` counts details rows; `not_submitted`
 *     counts actively-enrolled people without one. They are deliberately not
 *     unioned into an "All" chip: the two row shapes have almost no columns in
 *     common, so a combined list would be half empty and neither number would
 *     mean anything exact.
 */

const VIEW = Object.freeze({
  SUBMITTED: "submitted",
  NOT_SUBMITTED: "not_submitted",
});

const VIEW_KEYS = Object.values(VIEW);

const EXPORT_LIMIT = 10000;

const resolveView = (v) => (VIEW_KEYS.includes(v) ? v : VIEW.SUBMITTED);

/* ─── Filter plumbing ──────────────────────────────────────────────────────── */

const toArray = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((v) => String(v).split(","));
  return String(value).split(",");
};

// cohort_id is a uuid column. A junk value would otherwise reach Postgres and
// come back as "invalid input syntax for type uuid" — a 500 with the raw input
// echoed in it, for what is really just a bad query string. Dropped here.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Read the filter block off `req.query`, normalised and free of empties. */
function readFilters(query = {}) {
  const clean = (v) => String(v ?? "").trim();
  return {
    view: query.view,
    q: clean(query.q),
    careerStatuses: toArray(query.careerStatus)
      .map(clean)
      .filter((v) => CAREER_STATUSES.includes(v)),
    heardAbout: toArray(query.heardAbout)
      .map(clean)
      .filter((v) => HEARD_ABOUT_VALUES.includes(v)),
    genders: toArray(query.gender)
      .map((v) => clean(v).toLowerCase())
      .filter((v) => GENDERS.includes(v)),
    targetRoles: toArray(query.targetRole)
      .map((v) => clean(v).toLowerCase())
      .filter((v) => TARGET_ROLE_VALUES.includes(v)),
    courseId: clean(query.courseId),
    cohortIds: toArray(query.cohortId).map(clean).filter((v) => UUID_RE.test(v)),
    city: clean(query.city),
    // Tri-state: "yes" / "no" / absent. A bare `?hasResume=` must not read as
    // "no", which is what a truthiness check would do.
    hasResume: ["yes", "no"].includes(clean(query.hasResume))
      ? clean(query.hasResume)
      : "",
    from: clean(query.from),
    to: clean(query.to),
    sort: clean(query.sort),
    dir: clean(query.dir),
  };
}

/**
 * `lead_profile_id IN (…)` over active enrollments matching the programme and
 * cohort filters — the mechanism that keeps one person to one row (see the note
 * at the top of this file).
 *
 * Values go through sequelize.escape rather than into a template string:
 * course_id is a free-form STRING(100) that arrives from the query string.
 */
function activeEnrollmentSubquery({ courseId, cohortIds }) {
  const conditions = [`"status" = ${sequelize.escape(ENROLLMENT_STATUS.ACTIVE)}`];

  if (courseId) {
    conditions.push(`"course_id" = ${sequelize.escape(courseId)}`);
  }
  if (cohortIds && cohortIds.length) {
    const list = cohortIds.map((id) => sequelize.escape(id)).join(", ");
    conditions.push(`"cohort_id" IN (${list})`);
  }

  return `SELECT "lead_profile_id" FROM "lead_courses" WHERE ${conditions.join(" AND ")}`;
}

/** Inclusive end-of-day, so `to=2026-08-07` includes everything on the 7th. */
function endOfDay(value) {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * WHERE for the `submitted` view.
 *
 * Note what is NOT here: an active-enrollment requirement. A student who filled
 * the form in and later dropped keeps their submission — the answers were
 * collected and are still theirs. The enrollment subquery is applied only when
 * somebody actually filters by programme or cohort.
 */
function buildSubmittedQuery(filters) {
  const and = [{ submission_count: { [Op.gt]: 0 } }];

  if (filters.careerStatuses.length) {
    and.push({ career_status: { [Op.in]: filters.careerStatuses } });
  }
  if (filters.heardAbout.length) {
    and.push({ heard_about_us: { [Op.in]: filters.heardAbout } });
  }
  if (filters.genders.length) {
    and.push({ gender: { [Op.in]: filters.genders } });
  }
  if (filters.targetRoles.length) {
    // Overlap, not containment: picking "PM" and "APM" should return anyone
    // targeting either, which is what the chips read as. Op.contains would mean
    // "targets both" and quietly return almost nobody.
    and.push({ target_roles: { [Op.overlap]: filters.targetRoles } });
  }
  if (filters.city) {
    and.push({ current_city: { [Op.iLike]: filters.city } });
  }
  if (filters.hasResume === "yes") {
    and.push({ resume_url: { [Op.ne]: null } });
  } else if (filters.hasResume === "no") {
    and.push({ resume_url: { [Op.is]: null } });
  }

  if (filters.from || filters.to) {
    const range = {};
    if (filters.from) range[Op.gte] = new Date(filters.from);
    if (filters.to) range[Op.lte] = endOfDay(filters.to);
    and.push({ last_submitted_at: range });
  }

  if (filters.courseId || filters.cohortIds.length) {
    and.push(
      literal(
        `"LeadProfileDetails"."lead_profile_id" IN (${activeEnrollmentSubquery(filters)})`,
      ),
    );
  }

  if (filters.q) {
    const like = { [Op.iLike]: `%${filters.q}%` };
    and.push({
      [Op.or]: [
        { current_city: like },
        { org_name: like },
        { "$LeadProfile.name$": like },
        { "$LeadProfile.phone$": like },
        { "$LeadProfile.email$": like },
      ],
    });
  }

  return { [Op.and]: and };
}

/**
 * WHERE for the `not_submitted` view — the chase list.
 *
 * Pivots on LeadProfile rather than LeadProfileDetails, because the whole point
 * is the people who have no details row at all. Both halves are subqueries for
 * the same reason as above: a LEFT JOIN against lead_courses would duplicate
 * anyone on two programmes.
 */
function buildNotSubmittedQuery(filters) {
  const and = [
    literal(`"LeadProfile"."id" IN (${activeEnrollmentSubquery(filters)})`),
    literal(
      `"LeadProfile"."id" NOT IN (SELECT "lead_profile_id" FROM "lead_profile_details" WHERE "submission_count" > 0)`,
    ),
  ];

  if (filters.q) {
    const like = { [Op.iLike]: `%${filters.q}%` };
    and.push({ [Op.or]: [{ name: like }, { phone: like }, { email: like }] });
  }

  return { [Op.and]: and };
}

/* ─── Ordering ─────────────────────────────────────────────────────────────── */

const SORTABLE = Object.freeze({
  last_submitted_at: "last_submitted_at",
  first_submitted_at: "first_submitted_at",
  age: "age",
  total_experience_years: "total_experience_years",
  submission_count: "submission_count",
});

function resolveOrder(sort, dir) {
  const direction = String(dir).toLowerCase() === "asc" ? "ASC" : "DESC";

  if (sort === "name") {
    return [[{ model: LeadProfile, as: "LeadProfile" }, "name", direction]];
  }

  const column = SORTABLE[sort] || "last_submitted_at";
  // NULLS LAST throughout: age and experience are nullable, and a page of blank
  // cells at the top is never what someone sorting by them wanted.
  return [
    literal(`"LeadProfileDetails"."${column}" ${direction} NULLS LAST`),
    literal(`"LeadProfileDetails"."lead_profile_id" ASC`),
  ];
}

/* ─── Row shaping ──────────────────────────────────────────────────────────── */

const PROFILE_INCLUDE = {
  model: LeadProfile,
  as: "LeadProfile",
  attributes: ["id", "name", "phone", "email", "country_code"],
  required: true,
};

const labelFor = (map, value) => (value ? map[value] || value : null);

const HEARD_ABOUT_LABELS = Object.freeze(
  HEARD_ABOUT_OPTIONS.reduce((acc, o) => {
    acc[o.value] = o.label;
    return acc;
  }, {}),
);

/**
 * The three long free-text answers are deliberately absent from the list
 * payload — 2000 characters each, 50 to a page, to render a column nobody can
 * read. The export includes them; so does the profile page.
 */
function shapeRow(instance) {
  const d = instance.toJSON();
  const p = d.LeadProfile || {};

  return {
    leadProfileId: d.lead_profile_id,
    name: p.name || null,
    phone: p.phone || null,
    countryCode: p.country_code || null,
    email: p.email || null,
    programmes: [],
    age: d.age,
    gender: d.gender,
    genderLabel: labelFor(GENDER_LABELS, d.gender),
    currentCity: d.current_city,
    careerStatus: d.career_status,
    careerStatusLabel: labelFor(CAREER_STATUS_LABELS, d.career_status),
    careerStatusOther: d.career_status_other,
    orgName: d.org_name,
    // The job title, for the sub-line under the organisation. Rows written
    // before 2026-08-07 hold a paragraph here rather than a title; those are
    // dropped rather than shipped 50-to-a-page to be truncated to one line.
    // The full text is still in the CSV and on the profile page.
    roleTitle:
      d.role_description && d.role_description.length <= LIMITS.ROLE_MAX
        ? d.role_description
        : null,
    fieldOfStudy: d.field_of_study,
    totalExperienceYears: d.total_experience_years,
    linkedinUrl: d.linkedin_url,
    resumeUrl: d.resume_url,
    targetRoles: d.target_roles || [],
    // Resolved server-side so a new option renders correctly without a
    // frontend deploy.
    targetRoleLabels: (d.target_roles || []).map(
      (r) => TARGET_ROLE_LABELS[r] || r,
    ),
    targetRoleOther: d.target_role_other,
    heardAboutUs: d.heard_about_us,
    heardAboutUsLabel: labelFor(HEARD_ABOUT_LABELS, d.heard_about_us),
    heardAboutUsOther: d.heard_about_us_other,
    secondaryEmail: d.secondary_email,
    secondaryPhone: d.secondary_phone,
    secondaryCountryCode: d.secondary_country_code,
    completionPercent: completionPercent(d),
    submissionCount: d.submission_count,
    firstSubmittedAt: d.first_submitted_at,
    lastSubmittedAt: d.last_submitted_at,
  };
}

/** The chase-list shape: who they are, what they're on, nothing to show yet. */
function shapePendingRow(instance) {
  const p = instance.toJSON();
  return {
    leadProfileId: p.id,
    name: p.name || null,
    phone: p.phone || null,
    countryCode: p.country_code || null,
    email: p.email || null,
    programmes: [],
    submissionCount: 0,
    completionPercent: 0,
  };
}

/**
 * Attach programme chips to a page of rows, in one keyed query.
 *
 * Dropped enrollments are included and flagged rather than filtered out —
 * otherwise a student who submitted and then left shows a blank programme
 * column, which reads as a data fault rather than as what it is.
 */
async function attachProgrammes(rows) {
  if (!rows.length) return rows;

  const ids = rows.map((r) => r.leadProfileId);
  const enrollments = await LeadCourse.findAll({
    where: { lead_profile_id: { [Op.in]: ids } },
    attributes: [
      "lead_profile_id",
      "course_id",
      "program_name",
      "cohort_name",
      "status",
      "created_at",
    ],
    order: [["created_at", "DESC"]],
    raw: true,
  });

  const byProfile = new Map();
  for (const e of enrollments) {
    const list = byProfile.get(e.lead_profile_id) || [];
    list.push({
      courseId: e.course_id,
      programName: e.program_name,
      cohortName: e.cohort_name,
      dropped: e.status === ENROLLMENT_STATUS.DROPPED,
    });
    byProfile.set(e.lead_profile_id, list);
  }

  return rows.map((r) => ({
    ...r,
    programmes: byProfile.get(r.leadProfileId) || [],
  }));
}

/* ─── Counts ───────────────────────────────────────────────────────────────── */

/**
 * Both chip counts under the current filters.
 *
 * Each respects every filter except the view itself, so switching chips never
 * reshuffles the other number. The not-submitted count only honours the filters
 * that mean anything for someone who has answered nothing — programme, cohort
 * and the search box. City or career status cannot apply to a blank profile, so
 * that chip reads "of the people this filter COULD describe, N have not
 * answered".
 */
async function getCounts(filters) {
  const [submitted, notSubmitted] = await Promise.all([
    LeadProfileDetails.count({
      where: buildSubmittedQuery(filters),
      include: [{ ...PROFILE_INCLUDE, attributes: [] }],
      distinct: true,
      col: "lead_profile_id",
    }),
    LeadProfile.count({ where: buildNotSubmittedQuery(filters) }),
  ]);

  return { submitted, notSubmitted };
}

/* ─── Public API ───────────────────────────────────────────────────────────── */

async function listSubmissions({ query = {} }) {
  const filters = readFilters(query);
  const view = resolveView(filters.view);
  const { page, limit, offset } = parsePagination(query);

  if (view === VIEW.NOT_SUBMITTED) {
    const { rows, count } = await LeadProfile.findAndCountAll({
      where: buildNotSubmittedQuery(filters),
      attributes: ["id", "name", "phone", "email", "country_code"],
      order: [["name", String(filters.dir).toLowerCase() === "desc" ? "DESC" : "ASC"]],
      limit,
      offset,
    });

    const shaped = await attachProgrammes(rows.map(shapePendingRow));
    const counts = await getCounts(filters);
    return buildPage({ rows: shaped, count, page, limit }, { view, counts });
  }

  const { rows, count } = await LeadProfileDetails.findAndCountAll({
    where: buildSubmittedQuery(filters),
    include: [PROFILE_INCLUDE],
    order: resolveOrder(filters.sort, filters.dir),
    limit,
    offset,
    // The include is a 1:1 belongsTo, so flattening the query is safe and lets
    // the `$LeadProfile.name$` search reference the join.
    subQuery: false,
    distinct: true,
    col: "lead_profile_id",
  });

  const shaped = await attachProgrammes(rows.map(shapeRow));
  const counts = await getCounts(filters);

  return buildPage({ rows: shaped, count, page, limit }, { view, counts });
}

/**
 * The same query, unpaginated, for CSV. Hard-capped rather than unbounded — a
 * runaway export would pin the database and the Node process.
 */
async function listForExport({ query = {} }) {
  const filters = readFilters(query);
  const view = resolveView(filters.view);

  if (view === VIEW.NOT_SUBMITTED) {
    const rows = await LeadProfile.findAll({
      where: buildNotSubmittedQuery(filters),
      attributes: ["id", "name", "phone", "email", "country_code"],
      order: [["name", "ASC"]],
      limit: EXPORT_LIMIT + 1,
    });

    const truncated = rows.length > EXPORT_LIMIT;
    return {
      view,
      truncated,
      rows: await attachProgrammes(
        rows.slice(0, EXPORT_LIMIT).map(shapePendingRow),
      ),
    };
  }

  const rows = await LeadProfileDetails.findAll({
    where: buildSubmittedQuery(filters),
    include: [PROFILE_INCLUDE],
    order: resolveOrder(filters.sort, filters.dir),
    limit: EXPORT_LIMIT + 1,
    subQuery: false,
  });

  const truncated = rows.length > EXPORT_LIMIT;
  const page = rows.slice(0, EXPORT_LIMIT);

  // The long answers ride along on the export only. shapeRow drops them for the
  // list payload, so they are re-attached here from the same instances.
  const shaped = await attachProgrammes(
    page.map((instance) => ({
      ...shapeRow(instance),
      roleDescription: instance.role_description,
      aboutStudiesJob: instance.about_studies_job,
      hobbies: instance.hobbies,
    })),
  );

  return { view, truncated, rows: shaped };
}

/**
 * Options for the filter bar that cannot be hard-coded on the client.
 *
 * Cities come from the data; the two enum lists come from the constants file so
 * the dropdowns can never drift from what the portal actually stores.
 */
async function getFilterOptions() {
  const cities = await LeadProfileDetails.findAll({
    attributes: [
      [sequelize.fn("DISTINCT", sequelize.col("current_city")), "current_city"],
    ],
    where: {
      current_city: { [Op.ne]: null },
      submission_count: { [Op.gt]: 0 },
    },
    order: [[sequelize.col("current_city"), "ASC"]],
    raw: true,
  });

  return {
    cities: cities.map((c) => c.current_city).filter(Boolean),
    careerStatuses: CAREER_STATUSES.map((value) => ({
      value,
      label: CAREER_STATUS_LABELS[value],
    })),
    heardAbout: HEARD_ABOUT_OPTIONS.map((o) => ({ ...o })),
    genders: GENDER_OPTIONS.map((o) => ({ ...o })),
    targetRoles: TARGET_ROLE_OPTIONS.map((o) => ({ ...o })),
  };
}

module.exports = {
  listSubmissions,
  listForExport,
  getFilterOptions,
  readFilters,
  resolveView,
  VIEW,
  VIEW_KEYS,
  EXPORT_LIMIT,
};
