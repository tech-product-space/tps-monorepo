const { CourseFAQ, Course } = require("../../models");

module.exports = {
  // POST /courses/faqs/:courseId/bulk
  async bulkCreate(req, res) {
    const { courseId } = req.params;
    let items = req.body.faqs || req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        message: "Invalid payload: must provide an array of FAQs or an object with a 'faqs' array"
      });
    }

    const course = await Course.findByPk(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    // Validate each item before starting transaction
    const validatedFaqs = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item || typeof item !== "object") {
        return res.status(400).json({ message: `Item at index ${i} is not a valid object` });
      }

      const question = typeof item.question === "string" ? item.question.trim() : "";
      const answer = typeof item.answer === "string" ? item.answer.trim() : "";

      if (!question || !answer) {
        return res.status(400).json({
          message: `Item at index ${i} is missing question or answer`
        });
      }

      validatedFaqs.push({ question, answer });
    }

    const t = await CourseFAQ.sequelize.transaction();

    try {
      const maxOrder =
        (await CourseFAQ.max("order", {
          where: { course_id: courseId },
          transaction: t
        })) || 0;

      const { ulid } = require("ulid");
      const records = validatedFaqs.map((f, index) => ({
        id: ulid(),
        course_id: courseId,
        question: f.question,
        answer: f.answer,
        order: maxOrder + index + 1
      }));

      const created = await CourseFAQ.bulkCreate(records, {
        returning: true,
        transaction: t
      });

      await t.commit();

      return res.status(201).json({
        message: `Successfully imported ${created.length} FAQs`,
        count: created.length,
        faqs: created
      });
    } catch (err) {
      await t.rollback();
      console.error("Bulk create FAQs error:", err);
      return res.status(500).json({
        message: "Failed to import FAQs",
        error: err.message
      });
    }
  },

  // POST /courses/faqs/:courseId
  async create(req, res) {
    const { courseId } = req.params;
    const { question, answer } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ message: "Question and answer are required" });
    }

    const course = await Course.findByPk(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const maxOrder =
      (await CourseFAQ.max("order", { where: { course_id: courseId } })) || 0;

    const faq = await CourseFAQ.create({
      course_id: courseId,
      question,
      answer,
      order: maxOrder + 1
    });

    return res.status(201).json(faq);
  },

  // PUT /courses/faqs/:id
  async update(req, res) {
    const { id } = req.params;
    const updates = { ...req.body };
    delete updates.id;

    const faq = await CourseFAQ.findByPk(id);
    if (!faq) {
      return res.status(404).json({ message: "FAQ not found" });
    }

    await faq.update(updates);

    return res.json(faq);
  },

  // DELETE /courses/faqs/:id
  async delete(req, res) {
    const { id } = req.params;

    const faq = await CourseFAQ.findByPk(id);
    if (!faq) {
      return res.status(404).json({ message: "FAQ not found" });
    }

    await faq.destroy();

    return res.json({ message: "FAQ deleted successfully" });
  },

  // GET /courses/faqs/:courseId
  async getByCourseId(req, res) {
    const { courseId } = req.params;

    const faqs = await CourseFAQ.findAll({
      where: { course_id: courseId },
      order: [["order", "ASC"]]
    });

    return res.json(faqs);
  },

  // Reorder FAQs (drag & drop)
  // PUT /courses/faqs/:courseId/reorder
  async reorder(req, res) {
    const t = await CourseFAQ.sequelize.transaction();

    try {
      const { courseId } = req.params;
      const { faqIds } = req.body;

      if (!Array.isArray(faqIds)) {
        await t.rollback();
        return res.status(400).json({ message: "faqIds must be an array" });
      }

      for (let i = 0; i < faqIds.length; i++) {
        await CourseFAQ.update(
          { order: i + 1 },
          {
            where: {
              id: faqIds[i],
              course_id: courseId
            },
            transaction: t
          }
        );
      }

      await t.commit();

      return res.json({ message: "FAQs reordered successfully" });
    } catch (err) {
      await t.rollback();
      console.error("Reorder FAQs error:", err);
      return res.status(500).json({ message: "Failed to reorder FAQs" });
    }
  }
};
