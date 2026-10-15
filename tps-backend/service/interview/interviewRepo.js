// Postgres data access for interview questions, replacing models/mongo/
// InterviewQuestion.js and SavedQuestion.js.
//
// The frontends were built against Mongo documents: they read `_id` and send
// it back in URLs for questions, answers and feedback. So every row carries a
// `public_id` (24 hex chars) that is emitted as `_id` — migrated rows keep
// their original ObjectId, new rows get one in the same format — and the
// internal BIGINT ids never leave this module. Tables live in the "tps"
// schema, resolved through the connection's search_path.
const crypto = require("crypto");
const { cleanAnswerHtml } = require("../../utils/interviewHtml");
const { QueryTypes } = require("sequelize");
const { sequelize } = require("../../models");

// ObjectId-shaped: 4-byte unix seconds + 8 random bytes, as 24 hex chars.
const newPublicId = () => {
  const ts = Math.floor(Date.now() / 1000).toString(16).padStart(8, "0");
  return ts + crypto.randomBytes(8).toString("hex");
};

const select = (sql, bind = [], transaction) =>
  sequelize.query(sql, { bind, type: QueryTypes.SELECT, transaction });

const toArray = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

// Mongoose's Boolean caster, so form values like "true"/"0" keep working.
const toBool = (v, fallback) => {
  if (v === undefined || v === null) return fallback;
  if (typeof v === "boolean") return v;
  if (["true", "1", "yes", 1].includes(v)) return true;
  if (["false", "0", "no", 0].includes(v)) return false;
  return fallback;
};

const isUniqueViolation = (err) =>
  err?.name === "SequelizeUniqueConstraintError" || err?.original?.code === "23505";

let schemaEnsured = false;
const ensureSchema = async () => {
  if (schemaEnsured) return;
  try {
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS tps.interview_reports (
        id BIGSERIAL PRIMARY KEY,
        public_id CHAR(24) NOT NULL UNIQUE,
        question_id BIGINT NOT NULL REFERENCES tps.interview_questions(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        user_name TEXT,
        company_name TEXT NOT NULL,
        company_logo TEXT,
        role_name TEXT NOT NULL,
        interview_timing VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        reviewed_at TIMESTAMPTZ,
        reviewed_by INTEGER
      );
      CREATE INDEX IF NOT EXISTS interview_reports_question_idx ON tps.interview_reports (question_id, status);

      ALTER TABLE tps.interview_answers
        ADD COLUMN IF NOT EXISTS is_expert BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'published';

      CREATE TABLE IF NOT EXISTS tps.interview_answer_drafts (
        id BIGSERIAL PRIMARY KEY,
        question_id BIGINT NOT NULL REFERENCES tps.interview_questions(id) ON DELETE CASCADE,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (question_id, user_id)
      );

      CREATE TABLE IF NOT EXISTS tps.learner_question_submissions (
        id BIGSERIAL PRIMARY KEY,
        public_id CHAR(24) NOT NULL UNIQUE,
        user_id INTEGER NOT NULL,
        user_name TEXT,
        user_email TEXT,
        title TEXT NOT NULL,
        context TEXT,
        categories TEXT[] NOT NULL DEFAULT '{}',
        role TEXT,
        custom_role TEXT,
        is_interview BOOLEAN NOT NULL DEFAULT false,
        company TEXT,
        interview_timing VARCHAR(64),
        notify_on_answer BOOLEAN NOT NULL DEFAULT true,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        rejection_reason TEXT,
        canonical_question_id BIGINT REFERENCES tps.interview_questions(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        reviewed_at TIMESTAMPTZ,
        reviewed_by INTEGER
      );
      CREATE INDEX IF NOT EXISTS learner_question_submissions_user_idx ON tps.learner_question_submissions (user_id);
      CREATE INDEX IF NOT EXISTS learner_question_submissions_status_idx ON tps.learner_question_submissions (status);
    `);
    schemaEnsured = true;
  } catch (err) {
    console.error("ensureSchema in interviewRepo error:", err.message);
  }
};

const TIMING_ORDER = {
  "within_last_month": 1,
  "Within the last month": 1,
  "1_3_months": 2,
  "1–3 months ago": 2,
  "4_6_months": 3,
  "4–6 months ago": 3,
  "7_12_months": 4,
  "7–12 months ago": 4,
  "over_1_year": 5,
  "More than a year ago": 5,
  "unknown": 6,
  "I don’t remember": 6,
  "I don't remember": 6,
};

const formatTimingLabel = (t) => {
  if (!t) return "Interview timing unavailable";
  if (t === "within_last_month" || t === "Within the last month") return "1 month ago";
  if (t === "1_3_months" || t === "1–3 months ago") return "3 months ago";
  if (t === "4_6_months" || t === "4–6 months ago") return "5 months ago";
  if (t === "7_12_months" || t === "7–12 months ago") return "8 months ago";
  if (t === "over_1_year" || t === "More than a year ago") return "More than 1 year ago";
  if (t === "unknown" || t === "I don't remember" || t === "I don’t remember") return "Interview timing unavailable";
  return t;
};

const KNOWN_LOGOS = {
  meta: "meta",
  facebook: "meta",
  google: "google",
  amazon: "amazon",
  microsoft: "microsoft",
  apple: "apple",
  linkedin: "linkedin",
  netflix: "netflix",
  airbnb: "airbnb",
  uber: "uber",
  stripe: "stripe",
  swiggy: "swiggy",
  zomato: "zomato",
  flipkart: "flipkart",
  cred: "cred",
};

const normalizeLogo = (companyName, customLogo) => {
  if (customLogo) return customLogo;
  if (!companyName) return "";
  const key = companyName.toLowerCase().replace(/[^a-z0-9]/g, "");
  return KNOWN_LOGOS[key] || key;
};

const buildInterviewContext = (q, reports = []) => {
  if (!reports.length) {
    if (q.company) {
      const roles = Array.isArray(q.roles) ? q.roles.filter(Boolean) : [];
      return {
        totalReports: 1,
        totalCompanies: 1,
        lastAsked: "Interview timing unavailable",
        primaryRole: roles[0] || "Product Manager",
        roleSummary: roles[0] || "Product Manager",
        companySummary: q.company,
        isFallback: true,
        companies: [
          {
            name: q.company,
            logo: normalizeLogo(q.company),
            roles: roles.length ? roles : ["Product Manager"],
            reportsCount: 1,
            lastAsked: "Interview timing unavailable",
          },
        ],
      };
    }
    return {
      totalReports: 0,
      totalCompanies: 0,
      lastAsked: "No interview reports yet",
      primaryRole: "",
      roleSummary: "",
      companySummary: "",
      isFallback: false,
      companies: [],
    };
  }

  const companyMap = new Map();
  const allRoles = new Set();
  let mostRecentTimingRank = 999;
  let mostRecentTimingLabel = "Interview timing unavailable";

  for (const r of reports) {
    const cName = r.company_name.trim();
    if (!companyMap.has(cName)) {
      companyMap.set(cName, {
        name: cName,
        logo: normalizeLogo(cName, r.company_logo),
        rolesSet: new Set(),
        reportsCount: 0,
        minTimingRank: 999,
        lastAsked: "Interview timing unavailable",
      });
    }
    const cData = companyMap.get(cName);
    cData.reportsCount += 1;
    if (r.role_name) {
      cData.rolesSet.add(r.role_name.trim());
      allRoles.add(r.role_name.trim());
    }

    const rank = TIMING_ORDER[r.interview_timing] || 99;
    if (rank < cData.minTimingRank) {
      cData.minTimingRank = rank;
      cData.lastAsked = formatTimingLabel(r.interview_timing);
    }
    if (rank < mostRecentTimingRank) {
      mostRecentTimingRank = rank;
      mostRecentTimingLabel = formatTimingLabel(r.interview_timing);
    }
  }

  const companies = Array.from(companyMap.values())
    .map((c) => ({
      name: c.name,
      logo: c.logo,
      roles: Array.from(c.rolesSet),
      reportsCount: c.reportsCount,
      lastAsked: c.lastAsked,
    }))
    .sort((a, b) => b.reportsCount - a.reportsCount);

  const totalReports = reports.length;
  const totalCompanies = companies.length;
  const rolesArr = Array.from(allRoles);
  const primaryRole = rolesArr[0] || (Array.isArray(q.roles) && q.roles[0]) || "Product Manager";

  let roleSummary = primaryRole;
  if (rolesArr.length > 1) {
    roleSummary = `${primaryRole} +${rolesArr.length - 1} roles`;
  }

  let companySummary = companies[0]?.name || "";
  if (companies.length > 2) {
    companySummary = `${companies[0].name}, ${companies[1]?.name || ""} +${companies.length - 2} companies`;
  } else if (companies.length === 2) {
    companySummary = `${companies[0].name}, ${companies[1].name}`;
  }

  return {
    totalReports,
    totalCompanies,
    lastAsked: mostRecentTimingLabel,
    primaryRole,
    roleSummary,
    companySummary,
    isFallback: false,
    companies,
  };
};

// ---- serialization: rows -> the Mongo document shape ----------------------

// updatedAt is omitted when null: older Mongo feedback never had one.
const serializeFeedback = (f) => {
  const out = {
    _id: f.public_id,
    userId: f.user_id,
    userName: f.user_name,
    isMember: f.is_member,
    feedbackText: f.feedback_text,
    createdAt: f.created_at,
  };
  if (f.updated_at != null) out.updatedAt = f.updated_at;
  return out;
};

const serializeAnswer = (a, feedback = []) => ({
  _id: a.public_id,
  userId: a.user_id,
  userName: a.user_name,
  isMember: a.is_member,
  content: cleanAnswerHtml(a.content),
  likes: (a.liked_by || []).map(Number),
  feedback: feedback.map(serializeFeedback),
  isExpert: !!a.is_expert,
  isPinned: !!a.is_pinned,
  status: a.status || "published",
  createdAt: a.created_at,
});

// Optional scalars Mongo simply omitted when unset; keep omitting them.
const OPTIONAL = [
  ["meta_title", "metaTitle"],
  ["meta_desc", "metaDesc"],
  ["slug", "slug"],
  ["phone", "phone"],
  ["company", "company"],
];

const serializeQuestion = (q, answers = [], interviewContext = null) => {
  const out = {
    _id: q.public_id,
    userId: q.user_id,
    title: q.title,
    isPublished: q.is_published,
    type: q.types || [],
    role: q.roles || [],
    answers,
    interviewContext: interviewContext || buildInterviewContext(q, []),
    createdAt: q.created_at,
    updatedAt: q.updated_at,
    __v: 0,
  };
  for (const [col, key] of OPTIONAL) if (q[col] != null) out[key] = q[col];
  return out;
};

// Load answers + feedback + reports for a set of question rows and return full
// documents in the same order as `rows`.
const hydrate = async (rows, transaction, includePrivateAnswers = false) => {
  if (!rows.length) return [];
  await ensureSchema();
  const qIds = rows.map((r) => r.id);
  const answers = await select(
    `SELECT * FROM interview_answers WHERE question_id = ANY($1) ${includePrivateAnswers ? '' : "AND status = 'published'"} ORDER BY id`,
    [qIds],
    transaction
  );
  const aIds = answers.map((a) => a.id);
  const feedback = aIds.length
    ? await select(
        "SELECT * FROM interview_feedback WHERE answer_id = ANY($1) ORDER BY id",
        [aIds],
        transaction
      )
    : [];

  const reports = await select(
    "SELECT * FROM interview_reports WHERE question_id = ANY($1) AND status = 'approved' ORDER BY id",
    [qIds],
    transaction
  );

  const fbByAnswer = new Map();
  for (const f of feedback) {
    const k = String(f.answer_id);
    if (!fbByAnswer.has(k)) fbByAnswer.set(k, []);
    fbByAnswer.get(k).push(f);
  }

  const reportsByQuestion = new Map();
  for (const r of reports) {
    const k = String(r.question_id);
    if (!reportsByQuestion.has(k)) reportsByQuestion.set(k, []);
    reportsByQuestion.get(k).push(r);
  }

  const ansByQuestion = new Map();
  for (const a of answers) {
    const k = String(a.question_id);
    if (!ansByQuestion.has(k)) ansByQuestion.set(k, []);
    ansByQuestion.get(k).push(serializeAnswer(a, fbByAnswer.get(String(a.id))));
  }

  return rows.map((q) =>
    serializeQuestion(
      q,
      ansByQuestion.get(String(q.id)) || [],
      buildInterviewContext(q, reportsByQuestion.get(String(q.id)) || [])
    )
  );
};

const hydrateOne = async (row, transaction, includePrivateAnswers = false) => (row ? (await hydrate([row], transaction, includePrivateAnswers))[0] : null);

// ---- lookups --------------------------------------------------------------

const findQuestionRow = async (publicId, transaction) =>
  (await select("SELECT * FROM interview_questions WHERE public_id = $1", [String(publicId)], transaction))[0] || null;

const findPublishedQuestionBySlug = async (slug, transaction) =>
  (await select("SELECT * FROM interview_questions WHERE slug = $1 AND is_published = true", [slug], transaction))[0] || null;

const findPublishedQuestion = async (publicId) =>
  (await select("SELECT * FROM interview_questions WHERE public_id = $1 AND is_published = true", [String(publicId)]))[0] || null;

const findQuestionRowBySlug = async (slug) =>
  (await select("SELECT * FROM interview_questions WHERE slug = $1", [slug]))[0] || null;

const slugTaken = async (slug, excludePublicId) => {
  const rows = excludePublicId
    ? await select("SELECT 1 FROM interview_questions WHERE slug = $1 AND public_id <> $2", [slug, String(excludePublicId)])
    : await select("SELECT 1 FROM interview_questions WHERE slug = $1", [slug]);
  return rows.length > 0;
};

const findAnswerRow = async (questionRowId, answerPublicId, transaction) =>
  (
    await select(
      "SELECT * FROM interview_answers WHERE question_id = $1 AND public_id = $2",
      [questionRowId, String(answerPublicId)],
      transaction
    )
  )[0] || null;

const findFeedbackRow = async (answerRowId, feedbackPublicId, transaction) =>
  (
    await select(
      "SELECT * FROM interview_feedback WHERE answer_id = $1 AND public_id = $2",
      [answerRowId, String(feedbackPublicId)],
      transaction
    )
  )[0] || null;

const answerWithFeedback = async (answerRow, transaction) => {
  const feedback = await select(
    "SELECT * FROM interview_feedback WHERE answer_id = $1 ORDER BY id",
    [answerRow.id],
    transaction
  );
  return serializeAnswer(answerRow, feedback);
};

// Set of question public ids the user has saved.
const savedPublicIdSet = async (userId) => {
  if (!userId) return new Set();
  const rows = await select(
    `SELECT q.public_id FROM saved_questions s
       JOIN interview_questions q ON q.id = s.question_id
      WHERE s.user_id = $1`,
    [userId]
  );
  return new Set(rows.map((r) => r.public_id));
};

// ---- writes ---------------------------------------------------------------

const insertQuestion = async (doc, transaction) =>
  (
    await select(
      `INSERT INTO interview_questions
         (public_id, title, meta_title, meta_desc, slug, phone, roles, types,
          company, is_published, user_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [
        newPublicId(),
        doc.title,
        doc.metaTitle ?? null,
        doc.metaDesc ?? null,
        doc.slug ?? null,
        doc.phone ?? null,
        toArray(doc.role),
        toArray(doc.type),
        doc.company ?? null,
        toBool(doc.isPublished, false),
        doc.userId,
      ],
      transaction
    )
  )[0];

const insertAnswer = async (questionRowId, a, transaction) =>
  (
    await select(
      `INSERT INTO interview_answers
         (public_id, question_id, user_id, user_name, is_member, content, liked_by)
       VALUES ($1,$2,$3,$4,$5,$6,'{}') RETURNING *`,
      [newPublicId(), questionRowId, a.userId, a.userName, !!a.isMember, cleanAnswerHtml(a.content)],
      transaction
    )
  )[0];

const insertFeedback = async (answerRowId, f, transaction) =>
  (
    await select(
      `INSERT INTO interview_feedback
         (public_id, answer_id, user_id, user_name, is_member, feedback_text)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [newPublicId(), answerRowId, f.userId, f.userName, !!f.isMember, f.feedbackText],
      transaction
    )
  )[0];

// Partial update of a question row. `fields` uses camelCase API names; keys
// whose value is undefined are left alone, matching Mongoose's behaviour.
const QUESTION_COLUMNS = {
  title: "title",
  company: "company",
  role: "roles",
  type: "types",
  phone: "phone",
  isPublished: "is_published",
  slug: "slug",
  metaTitle: "meta_title",
  metaDesc: "meta_desc",
  updatedAt: "updated_at",
};

const updateQuestion = async (publicId, fields) => {
  const sets = [], changes = [], publicChanges = [], bind = [];
  for (const [key, col] of Object.entries(QUESTION_COLUMNS)) {
    if (key === "updatedAt" || fields[key] === undefined) continue;
    let value = fields[key];
    if (key === "role" || key === "type") value = toArray(value);
    if (key === "isPublished") value = toBool(value, false);
    bind.push(value);
    sets.push(col + " = $" + bind.length);
    changes.push(col + " IS DISTINCT FROM $" + bind.length);
    if (key !== "phone") publicChanges.push(col + " IS DISTINCT FROM $" + bind.length);
  }
  if (!sets.length) return findQuestionRow(publicId);
  sets.push("updated_at = CASE WHEN (" + (publicChanges.join(" OR ") || "false") + ") THEN now() ELSE updated_at END");
  bind.push(String(publicId));
  const rows = await select(
    "UPDATE interview_questions SET " + sets.join(", ") + " WHERE public_id = $" + bind.length + " AND (" + changes.join(" OR ") + ") RETURNING *", bind);
  return rows[0] || findQuestionRow(publicId);
};

// ---- reports --------------------------------------------------------------

const serializeReport = (r) => ({
  _id: r.public_id,
  questionId: r.question_id,
  userId: r.user_id,
  userName: r.user_name,
  companyName: r.company_name,
  companyLogo: normalizeLogo(r.company_name, r.company_logo),
  roleName: r.role_name,
  interviewTiming: r.interview_timing,
  status: r.status,
  createdAt: r.created_at,
  reviewedAt: r.reviewed_at,
  reviewedBy: r.reviewed_by,
});

const insertReport = async (data, transaction) => {
  await ensureSchema();
  const rows = await select(
    `INSERT INTO interview_reports
       (public_id, question_id, user_id, user_name, company_name, company_logo, role_name, interview_timing, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      newPublicId(),
      data.questionId,
      data.userId,
      data.userName || null,
      data.companyName.trim(),
      normalizeLogo(data.companyName, data.companyLogo),
      data.roleName.trim(),
      data.interviewTiming,
      data.status || "pending",
    ],
    transaction
  );
  return rows[0];
};

const findReportRow = async (publicId) => {
  await ensureSchema();
  const rows = await select("SELECT * FROM interview_reports WHERE public_id = $1", [String(publicId)]);
  return rows[0] || null;
};

const listReports = async ({ questionId, status, page = 1, limit = 20 } = {}) => {
  await ensureSchema();
  const where = [];
  const bind = [];

  if (questionId) {
    bind.push(questionId);
    where.push(`question_id = $${bind.length}`);
  }
  if (status) {
    bind.push(status);
    where.push(`status = $${bind.length}`);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const countRows = await select(`SELECT count(*)::int AS count FROM interview_reports ${whereSql}`, bind);
  const total = countRows[0]?.count || 0;

  const offset = (page - 1) * limit;
  bind.push(limit, offset);
  const rows = await select(
    `SELECT r.*, q.title as question_title, q.slug as question_slug
     FROM interview_reports r
     JOIN interview_questions q ON q.id = r.question_id
     ${whereSql}
     ORDER BY r.created_at DESC
     LIMIT $${bind.length - 1} OFFSET $${bind.length}`,
    bind
  );

  return {
    total,
    page,
    limit,
    reports: rows.map((r) => ({
      ...serializeReport(r),
      questionTitle: r.question_title,
      questionSlug: r.question_slug,
    })),
  };
};

const updateReport = async (publicId, { status, companyName, roleName, reviewedBy }) => {
  await ensureSchema();
  const sets = [];
  const bind = [];

  if (status !== undefined) {
    bind.push(status);
    sets.push(`status = $${bind.length}`);
    sets.push(`reviewed_at = now()`);
  }
  if (companyName !== undefined) {
    bind.push(companyName.trim());
    sets.push(`company_name = $${bind.length}`);
    sets.push(`company_logo = '${normalizeLogo(companyName)}'`);
  }
  if (roleName !== undefined) {
    bind.push(roleName.trim());
    sets.push(`role_name = $${bind.length}`);
  }
  if (reviewedBy !== undefined) {
    bind.push(reviewedBy);
    sets.push(`reviewed_by = $${bind.length}`);
  }

  if (!sets.length) return findReportRow(publicId);
  bind.push(String(publicId));
  const rows = await select(
    `UPDATE interview_reports SET ${sets.join(", ")} WHERE public_id = $${bind.length} RETURNING *`,
    bind
  );
  return rows[0] || null;
};

// ---- drafts ----------------------------------------------------------------

const getAnswerDraft = async (questionRowId, userId) => {
  await ensureSchema();
  const rows = await select(
    "SELECT * FROM interview_answer_drafts WHERE question_id = $1 AND user_id = $2",
    [questionRowId, userId]
  );
  if (!rows[0]) return null;
  return {
    questionId: questionRowId,
    userId,
    content: rows[0].content,
    updatedAt: rows[0].updated_at,
  };
};

const saveAnswerDraft = async (questionRowId, userId, content) => {
  await ensureSchema();
  const rows = await select(
    `INSERT INTO interview_answer_drafts (question_id, user_id, content, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (question_id, user_id)
     DO UPDATE SET content = EXCLUDED.content, updated_at = now()
     RETURNING *`,
    [questionRowId, userId, content]
  );
  return rows[0];
};

const deleteAnswerDraft = async (questionRowId, userId) => {
  await ensureSchema();
  return select(
    "DELETE FROM interview_answer_drafts WHERE question_id = $1 AND user_id = $2 RETURNING id",
    [questionRowId, userId]
  );
};

// ---- answer flags (expert, pin) --------------------------------------------

const toggleExpertAnswer = async (answerRowId, isExpert) => {
  await ensureSchema();
  const rows = await select(
    "UPDATE interview_answers SET is_expert = $1 WHERE id = $2 RETURNING *",
    [!!isExpert, answerRowId]
  );
  return rows[0] || null;
};

const togglePinnedAnswer = async (answerRowId, isPinned) => {
  await ensureSchema();
  const rows = await select(
    "UPDATE interview_answers SET is_pinned = $1 WHERE id = $2 RETURNING *",
    [!!isPinned, answerRowId]
  );
  return rows[0] || null;
};

// ---- learner question submissions -----------------------------------------

const serializeLearnerSubmission = (s, canonical = null) => ({
  _id: s.public_id,
  userId: s.user_id,
  userName: s.user_name || "Learner",
  userEmail: s.user_email || "",
  title: s.title,
  context: s.context || "",
  categories: s.categories || [],
  role: s.role || "",
  customRole: s.custom_role || "",
  isInterview: !!s.is_interview,
  company: s.company || "",
  interviewTiming: s.interview_timing || "",
  notifyOnAnswer: !!s.notify_on_answer,
  status: s.status || "pending",
  rejectionReason: s.rejection_reason || null,
  canonicalQuestion: canonical || null,
  createdAt: s.created_at,
  reviewedAt: s.reviewed_at,
});

const insertLearnerSubmission = async (data) => {
  await ensureSchema();
  const pid = newPublicId();
  const rows = await select(
    `INSERT INTO learner_question_submissions
      (public_id, user_id, user_name, user_email, title, context, categories, role, custom_role, is_interview, company, interview_timing, notify_on_answer, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'pending')
     RETURNING *`,
    [
      pid,
      data.userId,
      data.userName || "Learner",
      data.userEmail || "",
      data.title,
      data.context || "",
      toArray(data.categories),
      data.role || "",
      data.customRole || "",
      !!data.isInterview,
      data.company || "",
      data.interviewTiming || "",
      data.notifyOnAnswer !== false,
    ]
  );
  return rows[0] ? serializeLearnerSubmission(rows[0]) : null;
};

const listUserSubmissions = async (userId) => {
  await ensureSchema();
  const rows = await select(
    `SELECT s.*, q.public_id as canonical_public_id, q.title as canonical_title, q.slug as canonical_slug
     FROM learner_question_submissions s
     LEFT JOIN interview_questions q ON q.id = s.canonical_question_id
     WHERE s.user_id = $1
     ORDER BY s.created_at DESC`,
    [userId]
  );
  return rows.map((r) =>
    serializeLearnerSubmission(
      r,
      r.canonical_public_id
        ? {
            _id: r.canonical_public_id,
            title: r.canonical_title,
            slug: r.canonical_slug,
          }
        : null
    )
  );
};

const listAdminSubmissions = async ({ status = "all", limit = 20, offset = 0 }) => {
  await ensureSchema();
  const where = [];
  const bind = [];
  if (status && status !== "all") {
    bind.push(status);
    where.push(`s.status = $${bind.length}`);
  }
  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [{ count }] = await select(
    `SELECT count(*)::int AS count FROM learner_question_submissions s ${whereSql}`,
    bind
  );
  bind.push(limit);
  const limitParam = `$${bind.length}`;
  bind.push(offset);
  const offsetParam = `$${bind.length}`;

  const rows = await select(
    `SELECT s.*, q.public_id as canonical_public_id, q.title as canonical_title, q.slug as canonical_slug
     FROM learner_question_submissions s
     LEFT JOIN interview_questions q ON q.id = s.canonical_question_id
     ${whereSql}
     ORDER BY s.created_at DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    bind
  );
  return {
    submissions: rows.map((r) =>
      serializeLearnerSubmission(
        r,
        r.canonical_public_id
          ? {
              _id: r.canonical_public_id,
              title: r.canonical_title,
              slug: r.canonical_slug,
            }
          : null
      )
    ),
    total: count,
  };
};

const findSubmissionRow = async (publicId, transaction) => {
  await ensureSchema();
  const rows = await select(
    `SELECT * FROM learner_question_submissions WHERE public_id = $1 ${transaction ? "FOR UPDATE" : ""}`,
    [publicId], transaction
  );
  return rows[0] || null;
};

const updateSubmissionReview = async (id, { status, rejectionReason, canonicalQuestionId, reviewerId }, transaction) => {
  await ensureSchema();
  const rows = await select(
    `UPDATE learner_question_submissions
     SET status = $1, rejection_reason = $2, canonical_question_id = $3, reviewed_by = $4, reviewed_at = now()
     WHERE id = $5
     RETURNING *`,
    [status, rejectionReason || null, canonicalQuestionId || null, reviewerId || null, id],
    transaction
  );
  return rows[0] ? serializeLearnerSubmission(rows[0]) : null;
};

const suggestDuplicates = async (queryText, limit = 5) => {
  await ensureSchema();
  const term = `%${String(queryText).replace(/[\%_]/g, (c) => `\\${c}`)}%`;
  const rows = await select(
    `SELECT q.id, q.public_id, q.title, q.slug, q.company, q.roles, q.types,
            (SELECT count(*)::int FROM interview_answers a WHERE a.question_id = q.id AND a.status = 'published') as answers_count
     FROM interview_questions q
     WHERE q.is_published = true AND (q.title ILIKE $1 OR q.company ILIKE $1)
     ORDER BY answers_count DESC, q.created_at DESC
     LIMIT $2`,
    [term, limit]
  );
  return rows.map((r) => ({
    _id: r.public_id,
    title: r.title,
    slug: r.slug,
    company: r.company || "",
    role: r.roles || [],
    type: r.types || [],
    answersCount: r.answers_count || 0,
  }));
};

module.exports = {
  sequelize,
  select,
  toArray,
  toBool,
  isUniqueViolation,
  newPublicId,
  ensureSchema,
  hydrate,
  hydrateOne,
  serializeQuestion,
  serializeReport,
  answerWithFeedback,
  findQuestionRow,
  findQuestionRowBySlug,
  findPublishedQuestionBySlug,
  findPublishedQuestion,
  slugTaken,
  findAnswerRow,
  findFeedbackRow,
  savedPublicIdSet,
  insertQuestion,
  insertAnswer,
  insertFeedback,
  updateQuestion,
  insertReport,
  findReportRow,
  listReports,
  updateReport,
  getAnswerDraft,
  saveAnswerDraft,
  deleteAnswerDraft,
  toggleExpertAnswer,
  togglePinnedAnswer,
  serializeLearnerSubmission,
  insertLearnerSubmission,
  listUserSubmissions,
  listAdminSubmissions,
  findSubmissionRow,
  updateSubmissionReview,
  suggestDuplicates,
};
