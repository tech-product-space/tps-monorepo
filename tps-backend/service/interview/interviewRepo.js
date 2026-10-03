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
  content: a.content,
  likes: (a.liked_by || []).map(Number),
  feedback: feedback.map(serializeFeedback),
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

const serializeQuestion = (q, answers = []) => {
  const out = {
    _id: q.public_id,
    userId: q.user_id,
    title: q.title,
    isPublished: q.is_published,
    type: q.types || [],
    role: q.roles || [],
    answers,
    createdAt: q.created_at,
    updatedAt: q.updated_at,
    __v: 0,
  };
  for (const [col, key] of OPTIONAL) if (q[col] != null) out[key] = q[col];
  return out;
};

// Load answers + feedback for a set of question rows and return full
// documents in the same order as `rows`.
const hydrate = async (rows, transaction) => {
  if (!rows.length) return [];
  const qIds = rows.map((r) => r.id);
  const answers = await select(
    "SELECT * FROM interview_answers WHERE question_id = ANY($1) ORDER BY id",
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

  const fbByAnswer = new Map();
  for (const f of feedback) {
    const k = String(f.answer_id);
    if (!fbByAnswer.has(k)) fbByAnswer.set(k, []);
    fbByAnswer.get(k).push(f);
  }
  const ansByQuestion = new Map();
  for (const a of answers) {
    const k = String(a.question_id);
    if (!ansByQuestion.has(k)) ansByQuestion.set(k, []);
    ansByQuestion.get(k).push(serializeAnswer(a, fbByAnswer.get(String(a.id))));
  }
  return rows.map((q) => serializeQuestion(q, ansByQuestion.get(String(q.id)) || []));
};

const hydrateOne = async (row, transaction) => (row ? (await hydrate([row], transaction))[0] : null);

// ---- lookups --------------------------------------------------------------

const findQuestionRow = async (publicId, transaction) =>
  (await select("SELECT * FROM interview_questions WHERE public_id = $1", [String(publicId)], transaction))[0] || null;

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
      [newPublicId(), questionRowId, a.userId, a.userName, !!a.isMember, a.content],
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
  const sets = [];
  const bind = [];
  for (const [key, col] of Object.entries(QUESTION_COLUMNS)) {
    if (fields[key] === undefined) continue;
    let v = fields[key];
    if (key === "role" || key === "type") v = toArray(v);
    if (key === "isPublished") v = toBool(v, false);
    bind.push(v);
    sets.push(`${col} = $${bind.length}`);
  }
  if (!sets.length) return findQuestionRow(publicId);
  bind.push(String(publicId));
  return (
    await select(
      `UPDATE interview_questions SET ${sets.join(", ")} WHERE public_id = $${bind.length} RETURNING *`,
      bind
    )
  )[0] || null;
};

module.exports = {
  sequelize,
  select,
  toArray,
  toBool,
  isUniqueViolation,
  newPublicId,
  hydrate,
  hydrateOne,
  serializeQuestion,
  answerWithFeedback,
  findQuestionRow,
  findQuestionRowBySlug,
  slugTaken,
  findAnswerRow,
  findFeedbackRow,
  savedPublicIdSet,
  insertQuestion,
  insertAnswer,
  insertFeedback,
  updateQuestion,
};
