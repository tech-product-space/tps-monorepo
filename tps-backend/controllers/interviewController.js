const InterviewQuestion = require('../models/mongo/InterviewQuestion');
const SavedQuestion = require('../models/mongo/SavedQuestion');
const { company } = require("../models");
const { getPaginationParams, getMeta } = require('../utils/pagination');
const { toSlug } = require('../utils/slugHelpers');

// Build a unique slug from a base string (usually the question title),
// appending -2, -3, ... if the slugified value is already taken.
const generateUniqueSlug = async (base) => {
  const root = toSlug(base) || `question-${Date.now()}`;
  let candidate = root;
  let n = 2;
  // eslint-disable-next-line no-await-in-loop
  while (await InterviewQuestion.findOne({ slug: candidate }).select("_id").lean()) {
    candidate = `${root}-${n}`;
    n += 1;
  }
  return candidate;
};

exports.createQuestion = async (req, res) => {
  try {
    const { userId, title, phone, isPublished, company, type, role, slug } = req.body;

    const finalSlug = toSlug(slug && slug.trim() ? slug : title);

    // Reject duplicates: a question with the same slug already exists.
    const existing = await InterviewQuestion.findOne({ slug: finalSlug })
      .select("_id slug")
      .lean();
    if (existing) {
      return res.status(409).json({
        error: "This question has already been asked.",
        duplicate: true,
        slug: existing.slug,
      });
    }

    const question = new InterviewQuestion({ userId, title, phone, isPublished, company, type, answers: [], role, slug: finalSlug });
    await question.save();
    res.status(201).json(question);
  } catch (err) {
    if (err.code === 11000) {
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
      answers: [],
    };

    if (metaTitle) doc.metaTitle = metaTitle;
    if (metaDesc) doc.metaDesc = metaDesc;

    // Use the provided slug (must be unique) or derive a unique one from the title.
    if (slug && slug.trim()) {
      const cleanSlug = toSlug(slug.trim());
      const existing = await InterviewQuestion.findOne({ slug: cleanSlug });
      if (existing) {
        return res.status(400).json({ error: "Slug already taken" });
      }
      doc.slug = cleanSlug;
    } else {
      doc.slug = await generateUniqueSlug(title);
    }

    if (answerContent && answerContent.trim() && answerContent !== "<p></p>") {
      doc.answers.push({
        userId: authorId,
        userName: (userName && userName.trim()) || ADMIN_AUTHOR_NAME,
        isMember: false,
        content: answerContent,
        likes: [],
        feedback: [],
      });
    }

    const question = new InterviewQuestion(doc);
    await question.save();
    res.status(201).json(question);
  } catch (err) {
    if (err.code === 11000) {
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

    const update = { updatedAt: new Date() };
    if (title !== undefined) update.title = title;
    if (company !== undefined) update.company = company;
    if (role !== undefined) update.role = role;
    if (type !== undefined) update.type = type;
    if (phone !== undefined) update.phone = phone;
    if (isPublished !== undefined) update.isPublished = !!isPublished;

    const updated = await InterviewQuestion.findByIdAndUpdate(id, update, {
      new: true,
    });

    if (!updated) return res.status(404).json({ error: "Question not found" });

    res.json(updated);
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

    const question = await InterviewQuestion.findById(questionId);
    if (!question) return res.status(404).json({ error: "Question not found" });

    question.answers.push({
      userId: userId || ADMIN_AUTHOR_ID,
      userName: (userName && userName.trim()) || ADMIN_AUTHOR_NAME,
      isMember: false,
      content,
      likes: [],
      feedback: [],
    });
    await question.save();

    res.status(201).json(question);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllQuestions = async (req, res) => {
  try {
    const userId = req.query.userId ? parseInt(req.query.userId) : null;

    const questions = await InterviewQuestion.find({ isPublished: true }).lean();

    let savedSet = new Set();

    if (userId) {
      const savedQuestions = await SavedQuestion.find({ userId }).select('questionId');
      savedSet = new Set(savedQuestions.map((sq) => sq.questionId.toString()));
    }

    const questionsWithSavedFlag = questions.map((q) => ({
      ...q,
      isSaved: savedSet.has(q._id.toString()) // true if saved, else false
    }));

    return res.json(questionsWithSavedFlag);

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
    const { company, type, role, search } = req.query;

    const filter = { isPublished: true };

    if (company && company !== "all") filter.company = company;

    if (type && type !== "all")
      filter.type = Array.isArray(type) ? { $in: type } : { $in: [type] };

    if (role && role !== "all")
      filter.role = Array.isArray(role) ? { $in: role } : { $in: [role] };

    if (search && search.trim() !== "") {
      const regex = new RegExp(search, "i");
      filter.$or = [{ title: regex }, { description: regex }];
    }

    const result = await InterviewQuestion.aggregate([
      // ---- Saved lookup FIRST ----
      ...(userId
        ? [
          {
            $lookup: {
              from: "savedquestions",
              let: { qId: "$_id", uId: userId },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ["$questionId", "$$qId"] },
                        { $eq: ["$userId", "$$uId"] },
                      ],
                    },
                  },
                },
              ],
              as: "savedInfo",
            },
          },
          {
            $addFields: {
              isSaved: { $gt: [{ $size: "$savedInfo" }, 0] },
            },
          },
          { $project: { savedInfo: 0 } },
        ]
        : [{ $addFields: { isSaved: false } }]),

      // ---- filters ----
      {
        $match: {
          ...filter,
          ...(onlySaved ? { isSaved: true } : {}),
        },
      },

      // ---- Sort ----
      { $sort: { createdAt: -1 } },

      // ---- Pagination ----
      {
        $facet: {
          results: [{ $skip: offset }, { $limit: limit }],
          totalCount: [{ $count: "count" }],
        },
      },
    ]);

    const total = result[0].totalCount[0]?.count || 0;
    const questions = result[0].results;

    const meta = getMeta(total, page, limit);

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

exports.getPublishedQuestionsPaginated = async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const { search = "" } = req.query;

    const filter = { isPublished: true };

    if (search.trim() !== "") {
      filter.title = { $regex: search.trim(), $options: "i" };
    }

    const total = await InterviewQuestion.countDocuments(filter);

    const questions = await InterviewQuestion.find(filter)
      .skip(offset)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();

    let savedSet = new Set();

    const questionsWithSavedFlag = questions.map((q) => ({
      ...q,
      isSaved: savedSet.has(q._id.toString()),
    }));

    const meta = getMeta(total, page, limit);

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


exports.getUnpublishedQuestionsPaginated = async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query);
    const { search = "" } = req.query;

    const filter = { isPublished: false };

    if (search.trim() !== "") {
      filter.title = { $regex: search.trim(), $options: "i" };
    }

    const total = await InterviewQuestion.countDocuments(filter);

    const questions = await InterviewQuestion.find(filter)
      .skip(offset)
      .limit(limit)
      .sort({ createdAt: -1 })
      .lean();

    let savedSet = new Set();

    const questionsWithSavedFlag = questions.map((q) => ({
      ...q,
      isSaved: savedSet.has(q._id.toString()),
    }));

    const meta = getMeta(total, page, limit);

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




exports.getQuestionById = async (req, res) => {
  try {
    const { id } = req.params; // from route /questions/:id
    const userId = req.query.userId ? parseInt(req.query.userId) : null;

    // ✅ Fetch the question by ID
    const question = await InterviewQuestion.findById(id).lean();

    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    // ✅ Check if this question is saved by the user (if userId is provided)
    let isSaved = false;

    if (userId) {
      const saved = await SavedQuestion.findOne({ userId, questionId: id });
      isSaved = !!saved;
    }

    // ✅ Add the isSaved field
    const questionWithSavedFlag = {
      ...question,
      isSaved,
    };

    return res.json(questionWithSavedFlag);
  } catch (err) {
    console.error("Error fetching question by ID:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.getQuestionWithRelated = async (req, res) => {
  try {
    const { slug } = req.params;

    // ✅ Fetch question by slug (NOT _id)
    const question = await InterviewQuestion.findOne({ slug }).lean();

    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    // ✅ Fetch related questions (exclude current question by _id)
    const related = await InterviewQuestion.find({
      _id: { $ne: question._id },
      $or: [
        { type: { $in: question.type } },
        { company: question.company },
      ],
    })
      .limit(10)
      .lean();

    return res.json(related);
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

    const updatedQuestion = await InterviewQuestion.findByIdAndUpdate(
      id,
      { isPublished },
      { new: true }
    );

    if (!updatedQuestion) {
      return res.status(404).json({ error: "Question not found" });
    }

    return res.status(200).json({
      message: `Question ${isPublished ? "published" : "unpublished"} successfully.`,
      question: updatedQuestion,
    });
  } catch (err) {
    console.error("Error toggling publish status:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

exports.addAnswer = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { userId, email, userName, content } = req.body;

    const user = await company.findOne({ where: { email } });

    var isMember = false
    if (user) {
      isMember = true
    }
    const question = await InterviewQuestion.findById(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    question.answers.push({ userId, userName, isMember, content, likes: [], feedback: [] });
    await question.save();

    res.status(201).json(question);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.editAnswer = async (req, res) => {
  try {
    const { questionId, answerId } = req.params;
    const { userId, content } = req.body;

    const question = await InterviewQuestion.findById(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const answer = question.answers.id(answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    if (answer.userId !== userId) {
      return res.status(403).json({ error: "You cannot edit someone else's answer" });
    }

    answer.content = content;
    answer.updatedAt = new Date();

    await question.save();

    res.json({
      message: 'Answer updated successfully',
      data: answer
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteAnswer = async (req, res) => {
  try {
    const { questionId, answerId } = req.params;
    const { userId } = req.query;

    const question = await InterviewQuestion.findById(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const answer = question.answers.id(answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    if (answer.userId != userId) {
      return res.status(403).json({ error: "You cannot delete someone else's answer" });
    }

    answer.deleteOne();

    await question.save();

    res.json({ message: 'Answer deleted successfully' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.editAnswerAdmin = async (req, res) => {
  try {
    const { questionId, answerId } = req.params;
    const { content } = req.body;

    const question = await InterviewQuestion.findById(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const answer = question.answers.id(answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    answer.content = content;
    answer.updatedAt = new Date();

    await question.save();

    res.json({
      message: 'Answer updated successfully',
      data: answer
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deleteAnswerAdmin = async (req, res) => {
  try {
    const { questionId, answerId } = req.params;

    const question = await InterviewQuestion.findById(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const answer = question.answers.id(answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    answer.deleteOne();

    await question.save();

    res.json({ message: 'Answer deleted successfully' });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.likeAnswer = async (req, res) => {
  try {
    const { questionId, answerId } = req.params;
    const { userId } = req.body;

    const question = await InterviewQuestion.findById(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const answer = question.answers.id(answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    if (!answer.likes.includes(userId)) {
      answer.likes.push(userId);
      await question.save();
    } else {
      answer.likes = answer.likes.filter((id) => id !== userId);
      await question.save();
    }

    res.json(answer.likes);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.addFeedback = async (req, res) => {
  try {
    const { questionId, answerId } = req.params;
    const { userId, feedbackText, userName, email } = req.body;

    const question = await InterviewQuestion.findById(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const user = await company.findOne({ where: { email } });

    var isMember = false
    if (user) {
      isMember = true
    }

    const answer = question.answers.id(answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    answer.feedback.push({ userId, userName, isMember, feedbackText });
    await question.save();

    res.json(answer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.saveQuestion = async (req, res) => {
  try {
    const { userId } = req.body;
    const { questionId } = req.params;

    const existing = await SavedQuestion.findOne({ userId, questionId });

    if (existing) {
      await SavedQuestion.deleteOne({ _id: existing._id });
      return res.json({ message: 'Question unsaved successfully', isSaved: false });
    } else {
      const saved = new SavedQuestion({ userId, questionId });
      await saved.save();
      return res.json({ message: 'Question saved successfully', isSaved: true });
    }
  } catch (err) {
    if (err.code === 11000) { // duplicate key error
      return res.status(400).json({ error: 'Question already saved' });
    }
    res.status(500).json({ error: err.message });
  }
};

exports.getSavedQuestions = async (req, res) => {
  try {
    const { userId } = req.params;
    const saved = await SavedQuestion.find({ userId }).populate('questionId');
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// Add these two new exports to your controller file

exports.editFeedback = async (req, res) => {
  try {
    const { questionId, answerId, feedbackId } = req.params;
    const { userId, feedbackText } = req.body;

    if (!feedbackText || !feedbackText.trim()) {
      return res.status(400).json({ error: 'Feedback text is required' });
    }

    const question = await InterviewQuestion.findById(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const answer = question.answers.id(answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    const feedback = answer.feedback.id(feedbackId);
    if (!feedback) return res.status(404).json({ error: 'Feedback not found' });

    // Check if the user is the owner of the feedback
    if (feedback.userId !== userId) {
      return res.status(403).json({ error: 'You can only edit your own feedback' });
    }

    feedback.feedbackText = feedbackText;
    feedback.updatedAt = new Date();

    await question.save();

    res.json(question);
  } catch (err) {
    console.error('Error editing feedback:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteFeedback = async (req, res) => {
  try {
    const { questionId, answerId, feedbackId } = req.params;
    const { userId } = req.body;

    const question = await InterviewQuestion.findById(questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });

    const answer = question.answers.id(answerId);
    if (!answer) return res.status(404).json({ error: 'Answer not found' });

    const feedback = answer.feedback.id(feedbackId);
    if (!feedback) return res.status(404).json({ error: 'Feedback not found' });

    // Check if the user is the owner of the feedback
    if (feedback.userId !== userId) {
      return res.status(403).json({ error: 'You can only delete your own feedback' });
    }

    answer.feedback.pull(feedbackId);
    await question.save();

    res.json({ message: 'Feedback deleted successfully', question });
  } catch (err) {
    console.error('Error deleting feedback:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.editFeedbackAdmin = async (req, res) => {
  try {
    const { questionId, answerId, feedbackId } = req.params;
    const { feedbackText } = req.body;

    if (!feedbackText || !feedbackText.trim()) {
      return res.status(400).json({ error: "Feedback text is required" });
    }

    const question = await InterviewQuestion.findById(questionId);
    if (!question) return res.status(404).json({ error: "Question not found" });

    const answer = question.answers.id(answerId);
    if (!answer) return res.status(404).json({ error: "Answer not found" });

    const feedback = answer.feedback.id(feedbackId);
    if (!feedback) return res.status(404).json({ error: "Feedback not found" });

    feedback.feedbackText = feedbackText;
    feedback.updatedAt = new Date();

    await question.save();

    res.json({ message: "Feedback updated successfully", question });
  } catch (err) {
    console.error("Error editing feedback publicly:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteFeedbackAdmin = async (req, res) => {
  try {
    const { questionId, answerId, feedbackId } = req.params;

    const question = await InterviewQuestion.findById(questionId);
    if (!question) return res.status(404).json({ error: "Question not found" });

    const answer = question.answers.id(answerId);
    if (!answer) return res.status(404).json({ error: "Answer not found" });

    const feedback = answer.feedback.id(feedbackId);
    if (!feedback) return res.status(404).json({ error: "Feedback not found" });

    answer.feedback.pull(feedbackId);
    await question.save();

    res.json({
      message: "Feedback deleted successfully",
      question,
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

    const query = { slug: { $regex: new RegExp(`^${slug}$`, "i") } };

    // If excludeId exists, exclude that item (useful during updates)
    if (resourceId) {
      query["_id"] = { $ne: resourceId };
    }

    const existing = await InterviewQuestion.findOne(query);

    if (existing) {
      return res.status(200).json({
        result: "SUCCESS",
        available: false,
        slug,
        message: "URL already taken"
      });
    }

    return res.status(200).json({
      result: "SUCCESS",
      available: true,
      slug,
      message: "URL is available"
    });

  } catch (error) {
    console.error("Error checking slug availability:", error);
    return res.status(500).json({
      result: "ERROR",
      available: false,
      message: "Internal server error"
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

    // ✅ Fetch question by slug
    const question = await InterviewQuestion.findOne({ slug }).lean();

    if (!question) {
      return res.status(404).json({
        error: "Question not found",
      });
    }

    // ✅ Check if saved by user
    let isSaved = false;

    if (userId) {
      const saved = await SavedQuestion.findOne({
        userId,
        questionId: question._id,
      });
      isSaved = !!saved;
    }

    // ✅ Attach isSaved flag
    const questionWithSavedFlag = {
      ...question,
      isSaved,
    };

    return res.json(questionWithSavedFlag);
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
    const existing = await InterviewQuestion.findOne({
      slug: slug,
      _id: { $ne: id }
    });

    if (existing) {
      return res.status(400).json({
        result: "ERROR",
        message: "Slug already taken",
      });
    }

    const updated = await InterviewQuestion.findByIdAndUpdate(
      id,
      {
        slug,
        metaTitle,
        metaDesc,
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({
        result: "ERROR",
        message: "Interview question not found",
      });
    }

    return res.status(200).json({
      result: "SUCCESS",
      message: "Slug updated successfully",
      data: updated,
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

    const question = await InterviewQuestion.findOne(
      { slug },
      { metaTitle: 1, metaDesc: 1, _id: 0 }
    ).lean();

    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    return res.json({
      metaTitle: question.metaTitle || "",
      metaDesc: question.metaDesc || "",
    });
  } catch (err) {
    console.error("Error fetching question meta by slug:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};