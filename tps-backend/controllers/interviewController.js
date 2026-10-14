// Interview questions — Postgres (schema "tps") via service/interview/
// interviewRepo.js. Responses keep the shape the Mongo version returned
// (`_id`, nested `answers` / `feedback`, `likes`), because the frontends read
// those ids and send them back in URLs.
const { company } = require("../models");
const { getPaginationParams, getMeta } = require("../utils/pagination");
const { toSlug } = require("../utils/slugHelpers");
const repo = require("../service/interview/interviewRepo");

// Build a unique slug from a base string (usually the question title),
// appending -2, -3, ... if the slugified value is already taken.
const generateUniqueSlug = async (base) => {
  const root = toSlug(base) || `question-${Date.now()}`;
  let candidate = root;
  let n = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await repo.slugTaken(candidate)) {
    candidate = `${root}-${n}`;
    n += 1;
  }
  return candidate;
};

// Escape LIKE wildcards in user search input.
const likeTerm = (s) => `%${String(s).replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const withSavedFlag = (docs, savedSet) =>
  docs.map((q) => ({ ...q, isSaved: savedSet.has(q._id) }));

exports.createQuestion = async (req, res) => {
  try {
    const { userId, title, phone, isPublished, company, type, role, slug } = req.body;

    const finalSlug = toSlug(slug && slug.trim() ? slug : title);

    // Reject duplicates: a question with the same slug already exists.
    if (await repo.slugTaken(finalSlug)) {
      return res.status(409).json({
        error: "This question has already been asked.",
        duplicate: true,
        slug: finalSlug,
      });
    }

    const row = await repo.insertQuestion({ userId, title, phone, isPublished, company, type, role, slug: finalSlug });
    res.status(201).json(await repo.hydrateOne(row));
  } catch (err) {
    if (repo.isUniqueViolation(err)) {
      return res.status(409).json({
        error: "This question has already been asked.",
        duplicate: true,
      });
    }
    res.status(500).json({ error: err.message });
  }
};

// Default identity used when an admin authors a question/answer.
// The public site badges answers from this userId as "Admin".
const ADMIN_AUTHOR_ID = 2857;
// Shown as the answer author name unless the admin provides a custom one.
const ADMIN_AUTHOR_NAME = "Product Space";

// Create a question from the admin panel, optionally with an initial
// admin-authored answer. Unlike the public createQuestion this also
// supports slug/meta fields so the question can be published right away.
exports.createQuestionAdmin = async (req, res) => {
  try {
    const {
      title,
      phone,
      isPublished,
      company,
      type,
      role,
      slug,
      metaTitle,
      metaDesc,
      answerContent,
      userId,
      userName,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: "Title is required" });
    }

    const authorId = userId || ADMIN_AUTHOR_ID;

    const doc = {
      userId: authorId,
      title,
      phone,
      isPublished: !!isPublished,
      company,
      type,
      role,
    };

    if (metaTitle) doc.metaTitle = metaTitle;
    if (metaDesc) doc.metaDesc = metaDesc;

    // Use the provided slug (must be unique) or derive a unique one from the title.
    if (slug && slug.trim()) {
      const cleanSlug = toSlug(slug.trim());
      if (await repo.slugTaken(cleanSlug)) {
        return res.status(400).json({ error: "Slug already taken" });
      }
      doc.slug = cleanSlug;
    } else {
      doc.slug = await generateUniqueSlug(title);
    }

    const question = await repo.sequelize.transaction(async (t) => {
      const row = await repo.insertQuestion(doc, t);
      if (answerContent && answerContent.trim() && answerContent !== "<p></p>") {
        await repo.insertAnswer(
          row.id,
          {
            userId: authorId,
            userName: (userName && userName.trim()) || ADMIN_AUTHOR_NAME,
            isMember: false,
            content: answerContent,
          },
          t
        );
      }
      return repo.hydrateOne(row, t);
    });

    res.status(201).json(question);
  } catch (err) {
    if (repo.isUniqueViolation(err)) {
      return res.status(400).json({ error: "Slug already taken" });
    }
    res.status(500).json({ error: err.message });
  }
};

// Update a question's core fields from the admin panel.
// (Slug/meta are handled separately by updateSlug.)
exports.updateQuestionAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, company, role, type, phone, isPublished } = req.body;

    if (title !== undefined && !String(title).trim()) {
      return res.status(400).json({ error: "Title cannot be empty" });
    }

    const updated = await repo.updateQuestion(id, {
      updatedAt: new Date(),
      title,
      company,
      role,
      type,
      phone,
      isPublished: isPublished === undefined ? undefined : !!isPublished,
    });

    if (!updated) return res.status(404).json({ error: "Question not found" });

    res.json(await repo.hydrateOne(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Add an answer to a question from the admin panel.
exports.addAnswerAdmin = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { content, userId, userName } = req.body;

    if (!content || !content.trim() || content === "<p></p>") {
      return res.status(400).json({ error: "Answer content is required" });
    }

    const question = await repo.findQuestionRow(questionId);
    if (!question) return res.status(404).json({ error: "Question not found" });

    await repo.insertAnswer(question.id, {
      userId: userId || ADMIN_AUTHOR_ID,
      userName: (userName && userName.trim()) || ADMIN_AUTHOR_NAME,
      isMember: false,
      content,
    });

    res.status(201).json(await repo.hydrateOne(question));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllQuestions = async (req, res) => {
  try {
    const userId = req.query.userId ? parseInt(req.query.userId) : null;

    const rows = await repo.select("SELECT * FROM interview_questions WHERE is_published = true ORDER BY id");
    const questions = await repo.hydrate(rows);

    const savedSet = await repo.savedPublicIdSet(userId);

    return res.json(withSavedFlag(questions, savedSet));
  } catch (err) {
    console.error("Error fetching questions:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getAllUserQuestions = async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);

    const userId = req.query.userId ? parseInt(req.query.userId) : null;
    const onlySaved = req.query.onlySaved === "true";
    const view = req.query.view || (onlySaved ? "saved" : "all");
    const { company, type, role, search } = req.query;

    if (view === "mine") {
      if (!userId) {
        return res.json({ success: true, meta: getMeta(0, page, limit), data: [] });
      }
      const mySubmissions = await repo.listUserSubmissions(userId);
      return res.json({
        success: true,
        meta: getMeta(mySubmissions.length, 1, Math.max(limit, mySubmissions.length)),
        data: mySubmissions,
      });
    }

    const where = ["q.is_published = true"];
    const bind = [];
    const param = (v) => {
      bind.push(v);
      return `$${bind.length}`;
    };

    if (company && company !== "all") where.push(`q.company = ${param(company)}`);

    const typeValues = repo.toArray(type).flatMap((t) => String(t).split(",")).map((s) => s.trim()).filter(Boolean);
    if (typeValues.length > 0 && !typeValues.includes("all")) {
      where.push(`q.types && ${param(typeValues)}::text[]`);
    }

    if (role && role !== "all") {
      where.push(`q.roles && ${param(repo.toArray(role))}::text[]`);
    }

    if (search && search.trim() !== "") {
      where.push(`(q.title ILIKE ${param(likeTerm(search))} OR q.company ILIKE ${param(likeTerm(search))})`);
    }

    // Saved flag for this user (false for everyone when no userId).
    const savedExpr = userId
      ? `EXISTS (SELECT 1 FROM saved_questions s WHERE s.question_id = q.id AND s.user_id = ${param(userId)})`
      : "false";
    if (onlySaved || view === "saved") where.push(savedExpr);

    // The userId param is the last one added; the count only references it
    // when filtering to saved questions.
    const countBind = userId && !(onlySaved || view === "saved") ? bind.slice(0, -1) : bind.slice();

    const whereSql = where.join(" AND ");
    const [{ count }] = await repo.select(
      `SELECT count(*)::int AS count FROM interview_questions q WHERE ${whereSql}`,
      countBind
    );

    const sort = req.query.sort || req.query.sortBy || "recent";
    let orderSql = "q.created_at DESC, q.id ASC";
    if (sort === "discussed") {
      orderSql = "(SELECT count(*) FROM interview_answers a WHERE a.question_id = q.id) DESC, q.created_at DESC";
    } else if (sort === "reported") {
      orderSql = "(SELECT count(*) FROM interview_reports r WHERE r.question_id = q.id AND r.status = 'approved') DESC, q.created_at DESC";
    }

    const rows = await repo.select(
      `SELECT q.*, ${savedExpr} AS is_saved FROM interview_questions q
        WHERE ${whereSql}
        ORDER BY ${orderSql}
        LIMIT ${param(limit)} OFFSET ${param(offset)}`,
      bind
    );
    const docs = await repo.hydrate(rows);
    const questions = docs.map((q, i) => ({ ...q, isSaved: !!rows[i].is_saved }));

    const meta = getMeta(count, page, limit);

    res.json({
      success: true,
      meta,
      data: questions,
    });
  } catch (err) {
    console.error("Error fetching questions:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// Shared by the published / unpublished admin lists. Neither ever looked up
// saved state, so isSaved is always false (as before).
const listByPublished = (isPublished) => async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const { search = "" } = req.query;

    const where = ["is_published = $1"];
    const bind = [isPublished];
    if (search.trim() !== "") {
      bind.push(likeTerm(search.trim()));
      where.push(`title ILIKE $${bind.length}`);
    }
    const whereSql = where.join(" AND ");

    const [{ count }] = await repo.select(
      `SELECT count(*)::int AS count FROM interview_questions WHERE ${whereSql}`,
      bind
    );
    const rows = await repo.select(
      `SELECT * FROM interview_questions WHERE ${whereSql}
        ORDER BY created_at DESC, id ASC
        LIMIT $${bind.length + 1} OFFSET $${bind.length + 2}`,
      [...bind, limit, offset]
    );

    const questionsWithSavedFlag = withSavedFlag(await repo.hydrate(rows), new Set());

    const meta = getMeta(count, page, limit);

    return res.json({
      success: true,
      meta,
      data: questionsWithSavedFlag,
    });
  } catch (err) {
    console.error("Error fetching questions:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getPublishedQuestionsPaginated = listByPublished(true);
exports.getUnpublishedQuestionsPaginated = listByPublished(false);

exports.getQuestionById = async (req, res) => {
  try {
    const { id } = req.params; // from route /questions/:id
    const userId = req.query.userId ? parseInt(req.query.userId) : null;

    const row = await repo.findQuestionRow(id);

    if (!row) {
      return res.status(404).json({ error: "Question not found" });
    }

    let isSaved = false;
    if (userId) {
      const saved = await repo.select(
        "SELECT 1 FROM saved_questions WHERE user_id = $1 AND question_id = $2",
        [userId, row.id]
      );
      isSaved = saved.length > 0;
    }

    return res.json({ ...(await repo.hydrateOne(row)), isSaved });
  } catch (err) {
    console.error("Error fetching question by ID:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getQuestionWithRelated = async (req, res) => {
  try {
    const { slug } = req.params;

    const question = await repo.findQuestionRowBySlug(slug);

    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    // Same type, or same company; any publish state (matches the old query).
    const related = await repo.select(
      `SELECT * FROM interview_questions
        WHERE id <> $1
          AND (types && $2::text[] OR company IS NOT DISTINCT FROM $3)
        ORDER BY id
        LIMIT 10`,
      [question.id, question.types || [], question.company]
    );

    return res.json(await repo.hydrate(related));
  } catch (err) {
    console.error("Error fetching question with related:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.togglePublishStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { isPublished } = req.body;

    if (typeof isPublished !== "boolean") {
      return res.status(400).json({ error: "isPublished must be a boolean" });
    }

    const updated = await repo.updateQuestion(id, { isPublished });

    if (!updated) {
      return res.status(404).json({ error: "Question not found" });
    }

    return res.status(200).json({
      message: `Question ${isPublished ? "published" : "unpublished"} successfully.`,
      question: await repo.hydrateOne(updated),
    });
  } catch (err) {
    console.error("Error toggling publish status:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.addAnswer = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { userId, email, userName, content, isExpert } = req.body;

    const user = await company.findOne({ where: { email } });
    const isMember = !!user;

    const question = await repo.findQuestionRow(questionId);
    if (!question) return res.status(404).json({ error: "Question not found" });

    const newAnswer = await repo.insertAnswer(question.id, { userId, userName, isMember, content });

    if (isExpert) {
      await repo.toggleExpertAnswer(newAnswer.id, true);
    }

    if (userId) {
      await repo.deleteAnswerDraft(question.id, userId);
    }

    res.status(201).json(await repo.hydrateOne(question));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Resolve :questionId + :answerId (public ids) to rows, or send the 404.
const loadAnswer = async (req, res) => {
  const { questionId, answerId } = req.params;
  const question = await repo.findQuestionRow(questionId);
  if (!question) {
    res.status(404).json({ error: "Question not found" });
    return null;
  }
  const answer = await repo.findAnswerRow(question.id, answerId);
  if (!answer) {
    res.status(404).json({ error: "Answer not found" });
    return null;
  }
  return { question, answer };
};

const setAnswerContent = async (answerRow, content) =>
  (
    await repo.select(
      "UPDATE interview_answers SET content = $1 WHERE id = $2 RETURNING *",
      [content, answerRow.id]
    )
  )[0];

exports.editAnswer = async (req, res) => {
  try {
    const { userId, content } = req.body;

    const found = await loadAnswer(req, res);
    if (!found) return;

    if (found.answer.user_id !== userId) {
      return res.status(403).json({ error: "You cannot edit someone else's answer" });
    }

    const updated = await setAnswerContent(found.answer, content);

    res.json({
      message: "Answer updated successfully",
      data: await repo.answerWithFeedback(updated),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteAnswer = async (req, res) => {
  try {
    const { userId } = req.query;

    const found = await loadAnswer(req, res);
    if (!found) return;

    // eslint-disable-next-line eqeqeq
    if (found.answer.user_id != userId) {
      return res.status(403).json({ error: "You cannot delete someone else's answer" });
    }

    await repo.select("DELETE FROM interview_answers WHERE id = $1 RETURNING id", [found.answer.id]);

    res.json({ message: "Answer deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.editAnswerAdmin = async (req, res) => {
  try {
    const { content } = req.body;

    const found = await loadAnswer(req, res);
    if (!found) return;

    const updated = await setAnswerContent(found.answer, content);

    res.json({
      message: "Answer updated successfully",
      data: await repo.answerWithFeedback(updated),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteAnswerAdmin = async (req, res) => {
  try {
    const found = await loadAnswer(req, res);
    if (!found) return;

    await repo.select("DELETE FROM interview_answers WHERE id = $1 RETURNING id", [found.answer.id]);

    res.json({ message: "Answer deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.likeAnswer = async (req, res) => {
  try {
    const userId = Number(req.body.userId);

    const found = await loadAnswer(req, res);
    if (!found) return;

    // Toggle: add the user if absent, remove if present. Done in one
    // statement so concurrent likes can't lose each other's update.
    const [updated] = await repo.select(
      `UPDATE interview_answers
          SET liked_by = CASE WHEN $1 = ANY(liked_by)
                              THEN array_remove(liked_by, $1)
                              ELSE array_append(liked_by, $1) END
        WHERE id = $2
        RETURNING liked_by`,
      [userId, found.answer.id]
    );

    res.json((updated.liked_by || []).map(Number));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.addFeedback = async (req, res) => {
  try {
    const { userId, feedbackText, userName, email } = req.body;

    const question = await repo.findQuestionRow(req.params.questionId);
    if (!question) return res.status(404).json({ error: "Question not found" });

    const user = await company.findOne({ where: { email } });
    const isMember = !!user;

    const answer = await repo.findAnswerRow(question.id, req.params.answerId);
    if (!answer) return res.status(404).json({ error: "Answer not found" });

    await repo.insertFeedback(answer.id, { userId, userName, isMember, feedbackText });

    res.json(await repo.answerWithFeedback(answer));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.saveQuestion = async (req, res) => {
  try {
    const { userId } = req.body;
    const { questionId } = req.params;

    const question = await repo.findQuestionRow(questionId);
    if (!question) return res.status(404).json({ error: "Question not found" });

    const existing = await repo.select(
      "SELECT id FROM saved_questions WHERE user_id = $1 AND question_id = $2",
      [userId, question.id]
    );

    if (existing.length) {
      await repo.select("DELETE FROM saved_questions WHERE id = $1 RETURNING id", [existing[0].id]);
      return res.json({ message: "Question unsaved successfully", isSaved: false });
    }

    await repo.select(
      "INSERT INTO saved_questions (public_id, user_id, question_id) VALUES ($1,$2,$3) RETURNING id",
      [repo.newPublicId(), userId, question.id]
    );
    return res.json({ message: "Question saved successfully", isSaved: true });
  } catch (err) {
    if (repo.isUniqueViolation(err)) {
      return res.status(400).json({ error: "Question already saved" });
    }
    res.status(500).json({ error: err.message });
  }
};

// Shape matches Mongoose's populate('questionId'): each saved entry carries
// the full question document under `questionId`.
exports.getSavedQuestions = async (req, res) => {
  try {
    const { userId } = req.params;

    // Ordered by question id: Mongo served this from its {userId, questionId}
    // index, so the list came back sorted by questionId, not by save time.
    const saved = await repo.select(
      `SELECT s.* FROM saved_questions s
         JOIN interview_questions q ON q.id = s.question_id
        WHERE s.user_id = $1
        ORDER BY q.public_id`,
      [userId]
    );
    const questionRows = saved.length
      ? await repo.select("SELECT * FROM interview_questions WHERE id = ANY($1)", [saved.map((s) => s.question_id)])
      : [];
    const docs = await repo.hydrate(questionRows);
    const byRowId = new Map(questionRows.map((r, i) => [String(r.id), docs[i]]));

    res.json(
      saved.map((s) => ({
        _id: s.public_id,
        userId: s.user_id,
        questionId: byRowId.get(String(s.question_id)) || null,
        savedAt: s.saved_at,
        __v: 0,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Resolve :questionId + :answerId + :feedbackId, or send the 404.
const loadFeedback = async (req, res) => {
  const found = await loadAnswer(req, res);
  if (!found) return null;
  const feedback = await repo.findFeedbackRow(found.answer.id, req.params.feedbackId);
  if (!feedback) {
    res.status(404).json({ error: "Feedback not found" });
    return null;
  }
  return { ...found, feedback };
};

const setFeedbackText = (feedbackRow, feedbackText) =>
  repo.select(
    "UPDATE interview_feedback SET feedback_text = $1, updated_at = now() WHERE id = $2 RETURNING id",
    [feedbackText, feedbackRow.id]
  );

const deleteFeedbackRow = (feedbackRow) =>
  repo.select("DELETE FROM interview_feedback WHERE id = $1 RETURNING id", [feedbackRow.id]);

exports.editFeedback = async (req, res) => {
  try {
    const { userId, feedbackText } = req.body;

    if (!feedbackText || !feedbackText.trim()) {
      return res.status(400).json({ error: "Feedback text is required" });
    }

    const found = await loadFeedback(req, res);
    if (!found) return;

    // Check if the user is the owner of the feedback
    if (found.feedback.user_id !== userId) {
      return res.status(403).json({ error: "You can only edit your own feedback" });
    }

    await setFeedbackText(found.feedback, feedbackText);

    res.json(await repo.hydrateOne(found.question));
  } catch (err) {
    console.error("Error editing feedback:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteFeedback = async (req, res) => {
  try {
    const { userId } = req.body;

    const found = await loadFeedback(req, res);
    if (!found) return;

    // Check if the user is the owner of the feedback
    if (found.feedback.user_id !== userId) {
      return res.status(403).json({ error: "You can only delete your own feedback" });
    }

    await deleteFeedbackRow(found.feedback);

    res.json({ message: "Feedback deleted successfully", question: await repo.hydrateOne(found.question) });
  } catch (err) {
    console.error("Error deleting feedback:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.editFeedbackAdmin = async (req, res) => {
  try {
    const { feedbackText } = req.body;

    if (!feedbackText || !feedbackText.trim()) {
      return res.status(400).json({ error: "Feedback text is required" });
    }

    const found = await loadFeedback(req, res);
    if (!found) return;

    await setFeedbackText(found.feedback, feedbackText);

    res.json({ message: "Feedback updated successfully", question: await repo.hydrateOne(found.question) });
  } catch (err) {
    console.error("Error editing feedback publicly:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteFeedbackAdmin = async (req, res) => {
  try {
    const found = await loadFeedback(req, res);
    if (!found) return;

    await deleteFeedbackRow(found.feedback);

    res.json({
      message: "Feedback deleted successfully",
      question: await repo.hydrateOne(found.question),
    });
  } catch (err) {
    console.error("Error deleting feedback publicly:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET /interview/question/slug-availability?slug=<slug>&excludeId=<question_id>
exports.checkSlugAvailability = async (req, res) => {
  try {
    const rawSlug = req.query.slug?.trim();
    const resourceId = req.query.excludeId || null;

    if (!rawSlug) {
      return res.status(400).json({
        result: "ERROR",
        error: "Slug is required",
      });
    }

    const slug = toSlug(rawSlug);

    // Case-insensitive, optionally excluding the question being edited.
    const existing = resourceId
      ? await repo.select(
          "SELECT 1 FROM interview_questions WHERE lower(slug) = lower($1) AND public_id <> $2",
          [slug, String(resourceId)]
        )
      : await repo.select("SELECT 1 FROM interview_questions WHERE lower(slug) = lower($1)", [slug]);

    if (existing.length) {
      return res.status(200).json({
        result: "SUCCESS",
        available: false,
        slug,
        message: "URL already taken",
      });
    }

    return res.status(200).json({
      result: "SUCCESS",
      available: true,
      slug,
      message: "URL is available",
    });
  } catch (error) {
    console.error("Error checking slug availability:", error);
    return res.status(500).json({
      result: "ERROR",
      available: false,
      message: "Internal server error",
    });
  }
};

// GET /interview/question/slug/:slug
exports.getBySlug = async (req, res) => {
  try {
    const { slug } = req.params;
    const userId = req.query.userId ? parseInt(req.query.userId) : null;

    if (!slug) {
      return res.status(400).json({
        error: "'slug' is required",
      });
    }

    const row = await repo.findQuestionRowBySlug(slug);

    if (!row) {
      return res.status(404).json({
        error: "Question not found",
      });
    }

    let isSaved = false;
    if (userId) {
      const saved = await repo.select(
        "SELECT 1 FROM saved_questions WHERE user_id = $1 AND question_id = $2",
        [userId, row.id]
      );
      isSaved = saved.length > 0;
    }

    return res.json({ ...(await repo.hydrateOne(row)), isSaved });
  } catch (error) {
    console.error("Error fetching question by slug:", error);
    return res.status(500).json({
      result: "ERROR",
      message: "Internal server error",
    });
  }
};

// ADD OR UPDATE THE INTERVIEW QUESTION SLUG
exports.updateSlug = async (req, res) => {
  try {
    const { id } = req.params;
    const { slug, metaTitle, metaDesc } = req.body;

    if (!slug) {
      return res.status(400).json({
        result: "ERROR",
        message: "Slug is required",
      });
    }

    // Check if slug is already used by another record
    if (await repo.slugTaken(slug, id)) {
      return res.status(400).json({
        result: "ERROR",
        message: "Slug already taken",
      });
    }

    const updated = await repo.updateQuestion(id, { slug, metaTitle, metaDesc });

    if (!updated) {
      return res.status(404).json({
        result: "ERROR",
        message: "Interview question not found",
      });
    }

    return res.status(200).json({
      result: "SUCCESS",
      message: "Slug updated successfully",
      data: await repo.hydrateOne(updated),
    });
  } catch (error) {
    console.error("Error updating slug:", error);
    return res.status(500).json({
      result: "ERROR",
      message: "Internal server error",
    });
  }
};

// GET THE META DETAILS ACCORDING TO THE SLUG
exports.getQuestionMetaBySlug = async (req, res) => {
  try {
    const { slug } = req.params;

    const question = await repo.findQuestionRowBySlug(slug);

    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    return res.json({
      metaTitle: question.meta_title || "",
      metaDesc: question.meta_desc || "",
    });
  } catch (err) {
    console.error("Error fetching question meta by slug:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// GET /interview/questions/:slug/with-related
exports.getQuestionWithRelated = async (req, res) => {
  try {
    const { slug } = req.params;
    const row = await repo.findQuestionRowBySlug(slug);
    if (!row) {
      return res.status(404).json({ error: "Question not found" });
    }

    const types = row.types || [];
    const roles = row.roles || [];

    let relatedRows = [];
    if (types.length || roles.length) {
      relatedRows = await repo.select(
        `SELECT * FROM interview_questions
         WHERE is_published = true AND id <> $1 AND (types && $2 OR roles && $3)
         ORDER BY created_at DESC LIMIT 4`,
        [row.id, types, roles]
      );
    }

    if (relatedRows.length < 4) {
      const excludeIds = [row.id, ...relatedRows.map((r) => r.id)];
      const fillers = await repo.select(
        `SELECT * FROM interview_questions
         WHERE is_published = true AND id <> ALL($1)
         ORDER BY created_at DESC LIMIT $2`,
        [excludeIds, 4 - relatedRows.length]
      );
      relatedRows = [...relatedRows, ...fillers];
    }

    const hydrated = await repo.hydrate(relatedRows);
    return res.json(hydrated);
  } catch (err) {
    console.error("Error in getQuestionWithRelated:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// POST /interview/questions/:questionId/reports
exports.submitReport = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { userId, userName, companyName, roleName, interviewTiming, companyLogo } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Please sign in to submit a report." });
    }
    if (!companyName || !companyName.trim()) {
      return res.status(400).json({ error: "Company name is required." });
    }
    if (!roleName || !roleName.trim()) {
      return res.status(400).json({ error: "Role is required." });
    }
    if (!interviewTiming) {
      return res.status(400).json({ error: "Interview timing is required." });
    }

    const question = await repo.findQuestionRow(questionId);
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    const report = await repo.insertReport({
      questionId: question.id,
      userId,
      userName: userName || "Learner",
      companyName,
      companyLogo,
      roleName,
      interviewTiming,
      status: "pending",
    });

    return res.status(201).json({
      message: "Report submitted successfully for review.",
      report: repo.serializeReport(report),
    });
  } catch (err) {
    console.error("Error submitting interview report:", err);
    return res.status(500).json({ error: err.message });
  }
};

// GET /interview/questions/:questionId/draft
exports.getDraft = async (req, res) => {
  try {
    const { questionId } = req.params;
    const userId = Number(req.query.userId);
    if (!userId) return res.json({ content: "" });

    const question = await repo.findQuestionRow(questionId);
    if (!question) return res.status(404).json({ error: "Question not found" });

    const draft = await repo.getAnswerDraft(question.id, userId);
    return res.json(draft || { content: "" });
  } catch (err) {
    console.error("Error fetching draft:", err);
    return res.status(500).json({ error: err.message });
  }
};

// PUT /interview/questions/:questionId/draft
exports.saveDraft = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { userId, content } = req.body;
    if (!userId) return res.status(401).json({ error: "Authentication required" });

    const question = await repo.findQuestionRow(questionId);
    if (!question) return res.status(404).json({ error: "Question not found" });

    const draft = await repo.saveAnswerDraft(question.id, userId, content || "");
    return res.json({ message: "Draft saved", draft });
  } catch (err) {
    console.error("Error saving draft:", err);
    return res.status(500).json({ error: err.message });
  }
};

// GET /interview/admin/interview-reports
exports.listReportsAdmin = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const { status, questionId } = req.query;

    const result = await repo.listReports({ page, limit, status, questionId });
    return res.json(result);
  } catch (err) {
    console.error("Error listing reports:", err);
    return res.status(500).json({ error: err.message });
  }
};

// PUT /interview/admin/interview-reports/:id
exports.updateReportAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, companyName, roleName, reviewedBy } = req.body;

    const updated = await repo.updateReport(id, {
      status,
      companyName,
      roleName,
      reviewedBy,
    });
    if (!updated) return res.status(404).json({ error: "Report not found" });

    return res.json({
      message: "Report updated successfully",
      report: repo.serializeReport(updated),
    });
  } catch (err) {
    console.error("Error updating report:", err);
    return res.status(500).json({ error: err.message });
  }
};

// PUT /interview/questions/:questionId/answers/:answerId/expert
exports.toggleExpertAnswerAdmin = async (req, res) => {
  try {
    const { questionId, answerId } = req.params;
    const { isExpert } = req.body;

    const question = await repo.findQuestionRow(questionId);
    if (!question) return res.status(404).json({ error: "Question not found" });
    const answer = await repo.findAnswerRow(question.id, answerId);
    if (!answer) return res.status(404).json({ error: "Answer not found" });

    const updated = await repo.toggleExpertAnswer(answer.id, isExpert);
    return res.json({
      message: "Expert status updated",
      answer: await repo.answerWithFeedback(updated),
    });
  } catch (err) {
    console.error("Error updating expert answer status:", err);
    return res.status(500).json({ error: err.message });
  }
};

// PUT /interview/questions/:questionId/answers/:answerId/pin
exports.togglePinnedAnswerAdmin = async (req, res) => {
  try {
    const { questionId, answerId } = req.params;
    const { isPinned } = req.body;

    const question = await repo.findQuestionRow(questionId);
    if (!question) return res.status(404).json({ error: "Question not found" });
    const answer = await repo.findAnswerRow(question.id, answerId);
    if (!answer) return res.status(404).json({ error: "Answer not found" });

    const updated = await repo.togglePinnedAnswer(answer.id, isPinned);
    return res.json({
      message: "Pinned status updated",
      answer: await repo.answerWithFeedback(updated),
    });
  } catch (err) {
    console.error("Error updating pinned answer status:", err);
    return res.status(500).json({ error: err.message });
  }
};

// POST /interview/questions/submit
exports.submitLearnerQuestion = async (req, res) => {
  try {
    const {
      userId,
      userName,
      userEmail,
      title,
      context,
      categories,
      role,
      customRole,
      isInterview,
      company,
      interviewTiming,
      notifyOnAnswer,
    } = req.body;

    if (!title || !title.trim() || title.trim().length < 12) {
      return res.status(400).json({ error: "Question must be at least 12 characters long" });
    }
    if (!userId) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const submission = await repo.insertLearnerSubmission({
      userId,
      userName,
      userEmail,
      title: title.trim(),
      context: context ? context.trim() : "",
      categories: categories || [],
      role: role || "",
      customRole: customRole ? customRole.trim() : "",
      isInterview: !!isInterview,
      company: company ? company.trim() : "",
      interviewTiming: interviewTiming || "",
      notifyOnAnswer: notifyOnAnswer !== false,
    });

    res.status(201).json({
      success: true,
      message: "Question submitted for review",
      submission,
    });
  } catch (err) {
    console.error("Error submitting learner question:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET /interview/questions/my-submissions
exports.getMySubmissions = async (req, res) => {
  try {
    const userId = req.query.userId ? parseInt(req.query.userId) : null;
    if (!userId) {
      return res.json([]);
    }
    const submissions = await repo.listUserSubmissions(userId);
    res.json(submissions);
  } catch (err) {
    console.error("Error fetching user submissions:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET /interview/questions/suggest-duplicates
exports.suggestDuplicates = async (req, res) => {
  try {
    const q = req.query.q || req.query.query || "";
    if (!q || q.trim().length < 3) {
      return res.json([]);
    }
    const matches = await repo.suggestDuplicates(q.trim(), 5);
    res.json(matches);
  } catch (err) {
    console.error("Error suggesting duplicate questions:", err);
    res.status(500).json({ error: err.message });
  }
};

// GET /interview/admin/question-submissions
exports.getAdminSubmissions = async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const status = req.query.status || "all";

    const { submissions, total } = await repo.listAdminSubmissions({
      status,
      limit,
      offset,
    });

    res.json({
      submissions,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    console.error("Error fetching admin submissions:", err);
    res.status(500).json({ error: err.message });
  }
};

// PUT /interview/admin/question-submissions/:id/review
exports.reviewSubmission = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, rejectionReason, canonicalQuestionId, reviewerId, company, role, categories, title } = req.body;

    const submission = await repo.findSubmissionRow(id);
    if (!submission) {
      return res.status(404).json({ error: "Submission not found" });
    }

    if (action === "reject") {
      const updated = await repo.updateSubmissionReview(submission.id, {
        status: "rejected",
        rejectionReason: rejectionReason || "Does not meet community guidelines",
        reviewerId: reviewerId || ADMIN_AUTHOR_ID,
      });
      return res.json({ success: true, message: "Submission rejected", submission: updated });
    }

    if (action === "merge") {
      if (!canonicalQuestionId) {
        return res.status(400).json({ error: "canonicalQuestionId is required to merge" });
      }
      const canonicalQ = await repo.findQuestionRow(canonicalQuestionId);
      if (!canonicalQ) {
        return res.status(404).json({ error: "Canonical question not found" });
      }
      const updated = await repo.updateSubmissionReview(submission.id, {
        status: "merged",
        canonicalQuestionId: canonicalQ.id,
        reviewerId: reviewerId || ADMIN_AUTHOR_ID,
      });
      return res.json({ success: true, message: "Submission merged into canonical question", submission: updated });
    }

    if (action === "approve") {
      const approvedTitle = title || submission.title;
      const approvedSlug = await generateUniqueSlug(approvedTitle);
      const approvedCompany = company || submission.company || "General";
      const approvedRoles = role ? repo.toArray(role) : (submission.role ? [submission.role] : ["Product Manager"]);
      const approvedTypes = categories ? repo.toArray(categories) : (submission.categories && submission.categories.length > 0 ? submission.categories : ["Product sense"]);

      const newQ = await repo.insertQuestion({
        userId: submission.user_id,
        title: approvedTitle,
        company: approvedCompany,
        role: approvedRoles,
        type: approvedTypes,
        isPublished: true,
        slug: approvedSlug,
      });

      if (submission.is_interview && submission.company) {
        await repo.insertReport(newQ.id, {
          userId: submission.user_id,
          userName: submission.user_name || "Learner",
          companyName: submission.company,
          roleName: approvedRoles[0] || "Product Manager",
          interviewTiming: submission.interview_timing || "1–3 months ago",
          status: "approved",
        });
      }

      const updated = await repo.updateSubmissionReview(submission.id, {
        status: "approved",
        canonicalQuestionId: newQ.id,
        reviewerId: reviewerId || ADMIN_AUTHOR_ID,
      });

      return res.json({
        success: true,
        message: "Submission approved and question published",
        submission: updated,
        question: await repo.hydrateOne(newQ),
      });
    }

    return res.status(400).json({ error: "Invalid action. Must be 'approve', 'reject', or 'merge'." });
  } catch (err) {
    console.error("Error reviewing submission:", err);
    res.status(500).json({ error: err.message });
  }
};


