const { Op } = require("sequelize");
const {
  COURSE_LESSON_STATUS,
  COURSE_MODULE_STATUS,
  COURSE_STATUS,
  LESSON_CONTENT_VERSION,
} = require("../../constants/course");
const {
  Course,
  CourseModule,
  CourseModuleLesson,
  UserLessonProgress,
} = require("../../models");
const { toSlug, uniqueSlug } = require("../../utils/slugHelpers");

// Guards the bulk import endpoint against a runaway paste.
const MAX_IMPORT_LESSONS = 200;

const CONTENT_VERSIONS = Object.values(LESSON_CONTENT_VERSION);

/**
 * Reads a client-supplied `content_version`.
 *
 * Defaults to BLOCKS rather than the newer format on purpose: this API ships
 * ahead of the Tiptap editor, and a caller that says nothing is by definition an
 * older client that can only render blocks. The admin opts into TIPTAP by asking
 * for it.
 *
 * Returns `null` for a value that is present but not a known version, so the
 * caller can reject it rather than silently storing content no renderer claims.
 */
const readContentVersion = (raw) => {
  if (raw === undefined || raw === null || raw === "")
    return LESSON_CONTENT_VERSION.BLOCKS;

  const version = Number(raw);
  return CONTENT_VERSIONS.includes(version) ? version : null;
};

/**
 * Checks the `content` envelope against the version that claims it.
 *
 * Only the envelope: the blocks themselves and the ProseMirror nodes are built
 * client-side, where the block factory and the Tiptap schema live. Storing a
 * shape the matching renderer cannot read is the failure worth catching here.
 *
 * Returns an error string, or null when the content is acceptable.
 */
const validateContentEnvelope = (content, version, at) => {
  if (typeof content !== "object" || content === null || Array.isArray(content))
    return `${at}.content must be an object`;

  if (version === LESSON_CONTENT_VERSION.BLOCKS) {
    return Array.isArray(content.blocks)
      ? null
      : `${at}.content must be an object shaped { blocks: [] } for content_version 1`;
  }

  // Rejected rather than ignored. Only `doc` is read for version 2, so a blocks
  // envelope arriving under it would be accepted and then dropped on the floor —
  // the caller would see a 201 and an empty lesson.
  if (Array.isArray(content.blocks)) {
    return `${at}.content is version 1 content ({ blocks: [] }) but content_version is 2`;
  }

  // A lesson with nothing written yet is stored as an empty envelope, so `doc`
  // is allowed to be absent — but if it is there it has to be a document.
  if (content.doc === undefined || content.doc === null) return null;

  if (
    typeof content.doc !== "object" ||
    Array.isArray(content.doc) ||
    content.doc.type !== "doc"
  ) {
    return `${at}.content.doc must be a Tiptap document ({ type: "doc", content: [] }) for content_version 2`;
  }

  return null;
};

module.exports = {
  // POST /courses/modules/:moduleId/lessons/import
  // Bulk-creates lessons from a pasted payload. Validates the whole batch first,
  // then writes it in one transaction, so a bad entry never leaves a half-import.
  //
  // Note `create` above trusts the client's slug and there is no unique index on
  // (module_id, slug), so this action normalises and de-duplicates them itself.
  async importLessons(req, res) {
    const { moduleId } = req.params;
    const { lessons } = req.body;

    if (!Array.isArray(lessons) || lessons.length === 0) {
      return res
        .status(400)
        .json({ message: "'lessons' must be a non-empty array" });
    }

    if (lessons.length > MAX_IMPORT_LESSONS) {
      return res.status(400).json({
        message: `Cannot import more than ${MAX_IMPORT_LESSONS} lessons at once`,
      });
    }

    const course_module = await CourseModule.findByPk(moduleId);
    if (!course_module) {
      return res.status(404).json({ message: "Module not found" });
    }

    const existing = await CourseModuleLesson.findAll({
      where: { module_id: moduleId },
      attributes: ["slug"],
    });

    // Seeded with the slugs already in this module, then grown as we go so the
    // batch stays unique against the DB *and* against itself.
    const taken = new Set(existing.map((l) => l.slug));

    const maxOrder =
      (await CourseModuleLesson.max("order", {
        where: { module_id: moduleId },
      })) || 0;

    const prepared = [];

    for (let i = 0; i < lessons.length; i++) {
      const raw = lessons[i];
      const at = `lessons[${i}]`;

      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        return res.status(400).json({ message: `${at} must be an object` });
      }

      if (typeof raw.title !== "string" || !raw.title.trim()) {
        return res
          .status(400)
          .json({ message: `${at}.title is required and must be a string` });
      }

      // The column is STRING(255); a longer title would be a DB-level error.
      if (raw.title.trim().length > 255) {
        return res
          .status(400)
          .json({ message: `${at}.title must be 255 characters or fewer` });
      }

      if (
        raw.status &&
        !Object.values(COURSE_LESSON_STATUS).includes(raw.status)
      ) {
        return res.status(400).json({ message: `${at}.status is invalid` });
      }

      // Per lesson, not per batch: an importer is free to send a mixed payload,
      // and each row carries the version its own content is written in.
      const content_version = readContentVersion(raw.content_version);
      if (content_version === null) {
        return res.status(400).json({
          message: `${at}.content_version must be one of ${CONTENT_VERSIONS.join(", ")}`,
        });
      }

      // Content is built client-side (the block factory and the Tiptap schema
      // both live there), so validate the envelope and store the rest.
      let content =
        content_version === LESSON_CONTENT_VERSION.BLOCKS ? { blocks: [] } : {};

      if (raw.content !== undefined && raw.content !== null) {
        const problem = validateContentEnvelope(
          raw.content,
          content_version,
          at,
        );
        if (problem) return res.status(400).json({ message: problem });

        content =
          content_version === LESSON_CONTENT_VERSION.BLOCKS
            ? { blocks: raw.content.blocks }
            : { doc: raw.content.doc ?? null };
      }

      let seo_meta = {};
      if (raw.seo_meta !== undefined && raw.seo_meta !== null) {
        if (typeof raw.seo_meta !== "object" || Array.isArray(raw.seo_meta)) {
          return res
            .status(400)
            .json({ message: `${at}.seo_meta must be an object` });
        }
        seo_meta = raw.seo_meta;
      }

      const slug = uniqueSlug(raw.slug || raw.title, taken);
      taken.add(slug);

      prepared.push({
        module_id: moduleId,
        title: raw.title.trim(),
        slug,
        status: raw.status || COURSE_LESSON_STATUS.DRAFT,
        content,
        content_version,
        seo_meta,
        order: maxOrder + i + 1,
      });
    }

    try {
      // Managed transaction: rolls back automatically if the write throws, so
      // it cannot leak a pooled connection on an early exit.
      const created = await CourseModuleLesson.sequelize.transaction(async (t) =>
        CourseModuleLesson.bulkCreate(prepared, {
          transaction: t,
          validate: true,
        }),
      );

      return res.status(201).json({
        message: `Imported ${created.length} lesson${created.length > 1 ? "s" : ""}`,
        created: created.length,
        lessons: created,
      });
    } catch (err) {
      console.error("Import lessons error:", err);
      return res.status(500).json({ message: "Failed to import lessons" });
    }
  },

  // POST /courses/modules/:moduleId/lessons
  async create(req, res) {
    const { moduleId } = req.params;
    const { title, slug, content, status, seo_meta } = req.body;

    if (!slug || !title) {
      return res
        .status(400)
        .json({ message: "'slug' and 'title' is required" });
    }

    if (status && !Object.values(COURSE_LESSON_STATUS).includes(status)) {
      return res.status(400).json({ message: "Invalid lesson 'status'" });
    }

    const content_version = readContentVersion(req.body.content_version);
    if (content_version === null) {
      return res.status(400).json({
        message: `Invalid lesson 'content_version'; must be one of ${CONTENT_VERSIONS.join(", ")}`,
      });
    }

    if (content !== undefined && content !== null) {
      const problem = validateContentEnvelope(content, content_version, "body");
      if (problem) return res.status(400).json({ message: problem });
    }

    const course_module = await CourseModule.findByPk(moduleId);
    if (!course_module) {
      return res.status(404).json({ message: "Module not found" });
    }

    const maxOrder =
      (await CourseModuleLesson.max("order", {
        where: { module_id: moduleId },
      })) || 0;

    const lesson = await CourseModuleLesson.create({
      module_id: moduleId,
      title,
      slug,
      content: content || {},
      content_version,
      status: status || COURSE_LESSON_STATUS.DRAFT,
      order: maxOrder + 1,
      seo_meta: seo_meta || {},
    });

    return res.status(201).json(lesson);
  },

  // PUT /courses/modules/lessons/:id
  async update(req, res) {
    const { id } = req.params;
    const updates = { ...req.body };
    delete updates.id;

    const lesson = await CourseModuleLesson.findByPk(id);
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    if (
      updates.status &&
      !Object.values(COURSE_LESSON_STATUS).includes(updates.status)
    ) {
      return res.status(400).json({ message: "Invalid lesson 'status'" });
    }

    // Content and its version have to be judged together. Converting a lesson
    // sends both in one request — the new document and the version that explains
    // it — and checking the document against the row's *old* version would
    // reject exactly the conversion the endpoint exists to accept. When only the
    // content changes, the row's existing version is the one that applies.
    if (updates.content_version !== undefined) {
      const version = readContentVersion(updates.content_version);
      if (version === null) {
        return res.status(400).json({
          message: `Invalid lesson 'content_version'; must be one of ${CONTENT_VERSIONS.join(", ")}`,
        });
      }
      updates.content_version = version;
    }

    if (updates.content !== undefined && updates.content !== null) {
      const version = updates.content_version ?? lesson.content_version;
      const problem = validateContentEnvelope(updates.content, version, "body");
      if (problem) return res.status(400).json({ message: problem });
    }

    await lesson.update(updates);

    return res.json(lesson);
  },

  // DELETE /courses/modules/lessons/:id
  async delete(req, res) {
    const { id } = req.params;

    const lesson = await CourseModuleLesson.findByPk(id);
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    await lesson.destroy();

    return res.json({ message: "Lesson deleted successfully" });
  },

  // GET /courses/modules/:id
  async getById(req, res) {
    const { id } = req.params;

    // The module comes along for its `course_id`. The editor needs it to key
    // uploaded images (`written-course/<courseId>/…`), and a lesson id is all it
    // has in the URL — deriving it from the row means an image still uploads to
    // the right place when the lesson is opened from a bookmark or a link that
    // carries no course in its query string.
    const lesson = await CourseModuleLesson.findByPk(id, {
      include: [
        {
          model: CourseModule,
          as: "module",
          required: false,
          attributes: ["id", "slug", "course_id"],
        },
      ],
    });

    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    return res.json(lesson);
  },

  // GET /courses/modules/:moduleId/lessons
  async getByModuleId(req, res) {
    const { moduleId } = req.params;

    const lessons = await CourseModuleLesson.findAll({
      where: { module_id: moduleId },
      order: [["order", "ASC"]],
    });

    return res.json(lessons);
  },

  // PUT /courses/modules/:moduleId/lessons/reorder
  async reorder(req, res) {
    const { moduleId } = req.params;
    const { lessonIds } = req.body;

    // Validated before the transaction opens: an early return here used to skip
    // the rollback and leak the pooled connection until it timed out.
    if (!Array.isArray(lessonIds)) {
      return res.status(400).json({ message: "lessonIds must be an array" });
    }

    const t = await CourseModuleLesson.sequelize.transaction();

    try {
      const count = await CourseModuleLesson.count({
        where: { module_id: moduleId },
      });

      if (lessonIds.length !== count) {
        await t.rollback();
        return res.status(400).json({
          message: "Lesson list does not match existing lessons",
        });
      }

      for (let i = 0; i < lessonIds.length; i++) {
        await CourseModuleLesson.update(
          { order: i + 1 },
          {
            where: {
              id: lessonIds[i],
              module_id: moduleId,
            },
            transaction: t,
          },
        );
      }

      await t.commit();

      return res.json({ message: "Lessons reordered successfully" });
    } catch (err) {
      await t.rollback();
      console.error("Reorder lessons error:", err);
      return res.status(500).json({ message: "Failed to reorder lessons" });
    }
  },

  //GET /courses/modules/:moduleId/lessons/check-slug?slug=<slug>&excludeId=<excludeId>
  async checkSlugAvailability(req, res) {
    const { moduleId } = req.params;
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
      module_id: moduleId,
    };

    if (excludeId) {
      whereClause.id = { [Op.ne]: excludeId };
    }

    const existing = await CourseModuleLesson.findOne({ where: whereClause });

    return res.json({
      slug,
      available: !existing,
    });
  },

  // PUT /courses/modules/lessons/:id/status
  async updateLessonStatus(req, res) {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    if (status && !Object.values(COURSE_LESSON_STATUS).includes(status)) {
      return res.status(400).json({ message: "Invalid lesson 'status'" });
    }

    const lesson = await CourseModuleLesson.findByPk(id);
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    await lesson.update({ status });

    return res.json({
      message: "Lesson status updated successfully",
      id: lesson.id,
      status: lesson.status,
    });
  },

  // PUT /courses/modules/:moduleId/lessons/status
  // Sets every lesson in a module to one status, for the admin's "Publish All".
  // One statement, so it is atomic without a transaction; rows already at the
  // target status are skipped so `updated` reflects what actually changed.
  async bulkUpdateStatus(req, res) {
    const { moduleId } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ message: "Status is required" });
    }

    if (!Object.values(COURSE_LESSON_STATUS).includes(status)) {
      return res.status(400).json({ message: "Invalid lesson 'status'" });
    }

    const module = await CourseModule.findByPk(moduleId);
    if (!module) {
      return res.status(404).json({ message: "Module not found" });
    }

    const [updated] = await CourseModuleLesson.update(
      { status },
      { where: { module_id: moduleId, status: { [Op.ne]: status } } },
    );

    return res.json({
      message: `${updated} lesson${updated === 1 ? "" : "s"} marked as ${status}`,
      updated,
      status,
    });
  },

  // GET /courses/:courseSlug/modules/:moduleSlug/lessons/:lessonSlug
  async getBySlug(req, res) {
    const { courseSlug, moduleSlug, lessonSlug } = req.params;

    // A staff preview link lifts the publish filters on the lesson and the
    // module above it — which is the whole point, since a lesson being written
    // is a draft inside a module that is usually also a draft, and there is
    // otherwise no way to read it the way a learner will. `previewAuth` has
    // already checked the token was minted for this exact path, so nothing here
    // widens beyond the one lesson being asked for.
    const previewing = req.preview?.kind === "lesson";

    const lesson = await CourseModuleLesson.findOne({
      where: {
        slug: lessonSlug,
        ...(previewing ? {} : { status: COURSE_LESSON_STATUS.PUBLISHED }),
      },
      include: [
        {
          model: CourseModule,
          as: "module",
          required: true,
          attributes: ["id", "slug"],
          where: {
            slug: moduleSlug,
            ...(previewing
              ? {}
              : { status: COURSE_MODULE_STATUS.PUBLISHED }),
          },
          include: [
            {
              model: Course,
              as: "course",
              required: true,
              attributes: ["id", "slug"],
              where: { 
                slug: courseSlug
              },
            },
          ],
        },
      ],
    });

    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    return res.json(lesson);
  },

  // POST /courses/modules/lessons/:id/complete
  async completeLesson(req, res) {
    const { userId } = req.body;
    const { id: lessonId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "userId is required" });
    }

    const lesson = await CourseModuleLesson.findByPk(lessonId);
    if (!lesson) {
      return res.status(404).json({ message: "Lesson not found" });
    }

    const [record] = await UserLessonProgress.findOrCreate({
      where: { user_id: userId, lesson_id: lessonId },
      defaults: {
        completed: true,
        completed_at: new Date(),
      },
    });

    if (!record.completed) {
      await record.update({
        completed: true,
        completed_at: new Date(),
      });
    }

    return res.json({
      success: true,
      lessonId,
      completed: true,
    });
  },
};
