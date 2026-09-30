const { COURSE_MODULE_STATUS } = require("../../constants/course");
const { CourseModule, Course } = require("../../models");
const { toSlug, uniqueSlug } = require("../../utils/slugHelpers");
const { Op } = require("sequelize");

// Guards the bulk import endpoint against a runaway paste.
const MAX_IMPORT_MODULES = 100;

module.exports = {
  // POST /courses/modules/:courseId
  async create(req, res) {
    const { courseId } = req.params;
    const { title, slug, subtitle, overview, status } = req.body;

    if (!slug || !title) {
      return res
        .status(400)
        .json({ message: "'slug' and 'title' is required" });
    }

    if (status && !Object.values(COURSE_MODULE_STATUS).includes(status)) {
      return res.status(400).json({ message: "Invalid module 'status'" });
    }

    const course = await Course.findByPk(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const maxOrder =
      (await CourseModule.max("order", { where: { course_id: courseId } })) ||
      0;

    const course_module = await CourseModule.create({
      course_id: courseId,
      title,
      subtitle,
      slug,
      status: status || COURSE_MODULE_STATUS.DRAFT,
      overview: overview || {},
      order: maxOrder + 1,
    });

    return res.status(201).json(course_module);
  },

  // POST /courses/modules/:courseId/import
  // Bulk-creates modules from a pasted payload. Validates the whole batch first,
  // then writes it in one transaction, so a bad entry never leaves a half-import.
  async importModules(req, res) {
    const { courseId } = req.params;
    const { modules } = req.body;

    if (!Array.isArray(modules) || modules.length === 0) {
      return res
        .status(400)
        .json({ message: "'modules' must be a non-empty array" });
    }

    if (modules.length > MAX_IMPORT_MODULES) {
      return res.status(400).json({
        message: `Cannot import more than ${MAX_IMPORT_MODULES} modules at once`,
      });
    }

    const course = await Course.findByPk(courseId);
    if (!course) {
      return res.status(404).json({ message: "Course not found" });
    }

    const existing = await CourseModule.findAll({
      where: { course_id: courseId },
      attributes: ["slug"],
    });

    // Seeded with the slugs already on this course, then grown as we go so the
    // batch stays unique against the DB *and* against itself.
    const taken = new Set(existing.map((m) => m.slug));

    const maxOrder =
      (await CourseModule.max("order", { where: { course_id: courseId } })) || 0;

    const prepared = [];

    for (let i = 0; i < modules.length; i++) {
      const raw = modules[i];
      const at = `modules[${i}]`;

      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return res.status(400).json({ message: `${at} must be an object` });
      }

      if (typeof raw.title !== "string" || !raw.title.trim()) {
        return res
          .status(400)
          .json({ message: `${at}.title is required and must be a string` });
      }

      if (raw.subtitle !== undefined && typeof raw.subtitle !== "string") {
        return res
          .status(400)
          .json({ message: `${at}.subtitle must be a string` });
      }

      if (
        raw.status &&
        !Object.values(COURSE_MODULE_STATUS).includes(raw.status)
      ) {
        return res.status(400).json({ message: `${at}.status is invalid` });
      }

      // Lessons are a separate import; rejecting loudly beats dropping them silently.
      if (raw.lessons !== undefined) {
        return res.status(400).json({
          message: `${at}.lessons is not supported yet — import modules first, then add lessons`,
        });
      }

      let overview = { sections: [] };
      if (raw.overview !== undefined && raw.overview !== null) {
        if (
          typeof raw.overview !== "object" ||
          Array.isArray(raw.overview) ||
          !Array.isArray(raw.overview.sections)
        ) {
          return res.status(400).json({
            message: `${at}.overview must be an object shaped { sections: [] }`,
          });
        }
        overview = { sections: raw.overview.sections };
      }

      const slug = uniqueSlug(raw.slug || raw.title, taken);
      taken.add(slug);

      prepared.push({
        course_id: courseId,
        title: raw.title.trim(),
        subtitle: raw.subtitle ? raw.subtitle.trim() : null,
        slug,
        status: raw.status || COURSE_MODULE_STATUS.DRAFT,
        overview,
        order: maxOrder + i + 1,
      });
    }

    const t = await CourseModule.sequelize.transaction();
    try {
      const created = await CourseModule.bulkCreate(prepared, {
        transaction: t,
        validate: true,
      });

      await t.commit();

      return res.status(201).json({
        message: `Imported ${created.length} module${created.length > 1 ? "s" : ""}`,
        created: created.length,
        modules: created,
      });
    } catch (err) {
      await t.rollback();
      console.error("Import modules error:", err);
      return res.status(500).json({ message: "Failed to import modules" });
    }
  },

  // PUT /courses/modules/:id
  async update(req, res) {
    const { id } = req.params;
    const updates = { ...req.body };
    delete updates.id;

    if (
      updates.status &&
      !Object.values(COURSE_MODULE_STATUS).includes(updates.status)
    ) {
      return res.status(400).json({ message: "Invalid module 'status'" });
    }

    const course_module = await CourseModule.findByPk(id);
    if (!course_module) {
      return res.status(404).json({ message: "Module not found" });
    }

    await course_module.update(updates);

    return res.json(course_module);
  },

  // DELETE /courses/modules/:id
  async delete(req, res) {
    const { id } = req.params;

    const course_module = await CourseModule.findByPk(id);
    if (!course_module) {
      return res.status(404).json({ message: "Module not found" });
    }

    await course_module.destroy();

    return res.json({ message: "Module deleted successfully" });
  },

  // GET /courses/modules/:courseId
  async getByCourseId(req, res) {
    const { courseId } = req.params;

    const modules = await CourseModule.findAll({
      where: { course_id: courseId },
      order: [["order", "ASC"]],
    });

    return res.json(modules);
  },

  // Reorder modules (drag & drop)
  // PUT /courses/modules/:courseId/reorder
  async reorder(req, res) {
    const { courseId } = req.params;
    const { moduleIds } = req.body;

    // Validated before the transaction opens: an early return here used to skip
    // the rollback and leak the pooled connection until it timed out.
    if (!Array.isArray(moduleIds)) {
      return res.status(400).json({ message: "moduleIds must be an array" });
    }

    const t = await CourseModule.sequelize.transaction();

    try {
      const count = await CourseModule.count({
        where: { course_id: courseId },
      });

      if (moduleIds.length !== count) {
        await t.rollback();
        return res.status(400).json({
          message: "Module list does not match existing modules",
        });
      }

      for (let i = 0; i < moduleIds.length; i++) {
        await CourseModule.update(
          { order: i + 1 },
          {
            where: {
              id: moduleIds[i],
              course_id: courseId,
            },
            transaction: t,
          },
        );
      }

      await t.commit();

      return res.json({ message: "Modules reordered successfully" });
    } catch (err) {
      await t.rollback();
      console.error("Reorder modules error:", err);
      return res.status(500).json({ message: "Failed to reorder modules" });
    }
  },

  //GET /courses/modules/:courseId/check-slug?slug=<slug>&excludeId=<excludeId>
  async checkSlugAvailability(req, res) {
    const { courseId } = req.params;
    const { excludeId } = req.query;
    const rawSlug = req.query.slug?.trim();

    if (!rawSlug) {
      return res.status(400).json({
        available: false,
        message: "Slug is required",
      });
    }

    const slug = toSlug(rawSlug).toLowerCase();

    const whereClause = {
      slug,
      course_id: courseId,
    };

    if (excludeId) {
      whereClause.id = { [Op.ne]: excludeId };
    }

    const existing = await CourseModule.findOne({ where: whereClause });

    return res.json({
      slug,
      available: !existing,
    });
  },

  // PUT /courses/modules/:id/status
  async updateModuleStatus(req, res) {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    if (status && !Object.values(COURSE_MODULE_STATUS).includes(status)) {
      return res.status(400).json({ message: "Invalid module 'status'" });
    }

    const course_module = await CourseModule.findByPk(id);
    if (!course_module) {
      return res.status(404).json({ message: "Module not found" });
    }

    await course_module.update({ status });

    return res.json({
      message: "Module status updated successfully",
      id: course_module.id,
      status: course_module.status,
    });
  },
  
};
