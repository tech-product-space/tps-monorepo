import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
const {
  FreeCourse,
  FreeCourseCertificate,
  FreeCourseCertificateTemplate,
  FreeCourseEmailTemplate,
} = db;

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { FREE_COURSE_EMAIL_TYPES } from "../../config/constants/freeCourse.js";
import { FREE_COURSE_CERTIFICATE_STATUS } from "../../config/constants/freeCourseCertificate.js";

/**
 * Copying a certificate setup from one course to another.
 *
 * Most free courses share a design and an email — the same background, the same
 * wording with a different title in it. Building each one from scratch is not
 * just slow, it is how they drift apart: a font changed on one course and not
 * the others is invisible until two learners compare certificates.
 *
 * Two things make this safe to do by reference rather than by duplication:
 *
 *   - **The background is an S3 key, and nothing deletes it.** `upsertTemplate`
 *     overwrites the key on the row and leaves the object alone, so two courses
 *     pointing at one background cannot pull the image out from under each
 *     other. No copy of the file is made.
 *   - **`courseTitle` is a placeholder, not a value.** The field list stores
 *     where the title is drawn, and the renderer fills it from whichever course
 *     it is issuing for. A copied design prints the *target* course's title.
 *
 * What is emphatically not copied is anything already issued. Certificates
 * carry a `templateSnapshot` of the design they were made with, so replacing a
 * course's template changes what the next learner gets and nothing about what
 * previous ones hold.
 */

/** How many courses the dialog lists at once, and the ceiling a caller can ask for. */
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

/**
 * Everything the copy dialog needs, in one call.
 *
 * Searched, ordered and capped **in the database**, not in JavaScript. There is
 * no ceiling on how many free courses exist, and "fetch every template, then
 * slice" is the kind of listing that works fine until the day it doesn't. The
 * join is the honest way to ask the actual question — "courses that have a
 * design or an email" — because a course with neither should never occupy a row
 * in a list of things to copy from.
 *
 * Ordered by the most recent touch of either half: the course somebody was just
 * working on is overwhelmingly the one they mean to copy from.
 */
export const listCopySources = asyncWrapper(async (req, res) => {
  const { courseId } = req.params;

  const search = String(req.query.search || "").trim();
  const limit = Math.min(
    Math.max(Number(req.query.limit) || DEFAULT_LIMIT, 1),
    MAX_LIMIT,
  );

  const course = await FreeCourse.findByPk(courseId, { attributes: ["id"] });

  if (!course) {
    return res.status(404).json({ message: "Course not found" });
  }

  // Both halves of the search are matched — the course title and the design's
  // own name. Two courses called "Design Fundamentals" and "Design Sprint" are
  // told apart by their template name, which is what the list shows.
  const filter = `
    FROM "FreeCourses" c
    LEFT JOIN "FreeCourseCertificateTemplates" t ON t."freeCourseId" = c.id
    LEFT JOIN "FreeCourseEmailTemplates" e
      ON e."freeCourseId" = c.id AND e.type = :emailType
    WHERE c.id <> :courseId
      AND (t.id IS NOT NULL OR e.id IS NOT NULL)
      AND (:search = '' OR c.title ILIKE :like OR t.name ILIKE :like)
  `;

  const replacements = {
    courseId,
    emailType: FREE_COURSE_EMAIL_TYPES.CERTIFICATE,
    search,
    like: `%${search}%`,
    limit,
  };

  const [rows, counted, targetTemplate, targetEmail, issuedCertificates] =
    await Promise.all([
      db.sequelize.query(
        `
        SELECT
          c.id,
          c.title,
          (t.id IS NOT NULL) AS "hasTemplate",
          (e.id IS NOT NULL) AS "hasEmail",
          t.name              AS "templateName",
          e.subject           AS "emailSubject",
          COALESCE(e."isEnabled", false) AS "emailEnabled",
          GREATEST(
            COALESCE(t."updatedAt", to_timestamp(0)),
            COALESCE(e."updatedAt", to_timestamp(0))
          ) AS "updatedAt"
        ${filter}
        ORDER BY "updatedAt" DESC
        LIMIT :limit
        `,
        { replacements, type: db.Sequelize.QueryTypes.SELECT },
      ),
      // The total behind the cap, so the dialog can say "20 of 143" instead of
      // implying the list it shows is all there is.
      db.sequelize.query(`SELECT COUNT(*)::int AS count ${filter}`, {
        replacements,
        type: db.Sequelize.QueryTypes.SELECT,
      }),
      FreeCourseCertificateTemplate.findOne({
        where: { freeCourseId: courseId },
        attributes: ["id"],
      }),
      FreeCourseEmailTemplate.findOne({
        where: {
          freeCourseId: courseId,
          type: FREE_COURSE_EMAIL_TYPES.CERTIFICATE,
        },
        attributes: ["id"],
      }),
      // Drives the warning on the confirm step. Already-issued certificates are
      // not affected by a copy, but an admin about to replace a live course's
      // design deserves to be told there are any.
      FreeCourseCertificate.count({
        where: {
          freeCourseId: courseId,
          status: { [Op.ne]: FREE_COURSE_CERTIFICATE_STATUS.REVOKED },
        },
      }),
    ]);

  return res.status(200).json({
    data: {
      sources: rows,
      total: counted[0]?.count ?? rows.length,
      limit,
      target: {
        hasTemplate: !!targetTemplate,
        hasEmail: !!targetEmail,
        issuedCertificates,
      },
    },
  });
});

/**
 * POST /free-courses/certificates/admin/:courseId/copy
 *
 * Body: `{ fromCourseId, template?: boolean, email?: boolean }`
 *
 * Replaces this course's design and/or certificate email with another course's.
 * Both halves are optional but at least one must be asked for — a copy that
 * copies nothing is a mistake, not a no-op worth succeeding at.
 */
export const copyFromCourse = asyncWrapper(async (req, res) => {
  const { courseId } = req.params;
  const { fromCourseId } = req.body;
  const wantsTemplate = req.body.template === true;
  const wantsEmail = req.body.email === true;

  const adminId = req.admin?.id || null;

  if (!fromCourseId) {
    return res.status(400).json({ message: "fromCourseId is required" });
  }

  if (fromCourseId === courseId) {
    return res
      .status(422)
      .json({ message: "A course cannot be copied onto itself." });
  }

  if (!wantsTemplate && !wantsEmail) {
    return res
      .status(400)
      .json({ message: "Choose at least one of the design or the email." });
  }

  const [course, source] = await Promise.all([
    FreeCourse.findByPk(courseId, { attributes: ["id"] }),
    FreeCourse.findByPk(fromCourseId, { attributes: ["id", "title"] }),
  ]);

  if (!course) {
    return res.status(404).json({ message: "Course not found" });
  }

  if (!source) {
    return res.status(404).json({ message: "The course to copy from was not found" });
  }

  const [sourceTemplate, sourceEmail] = await Promise.all([
    wantsTemplate
      ? FreeCourseCertificateTemplate.findOne({
          where: { freeCourseId: fromCourseId },
        })
      : null,
    wantsEmail
      ? FreeCourseEmailTemplate.findOne({
          where: {
            freeCourseId: fromCourseId,
            type: FREE_COURSE_EMAIL_TYPES.CERTIFICATE,
          },
        })
      : null,
  ]);

  // Asking for a half the source does not have is a failed copy, not a partial
  // one. Silently copying only the email when the design was also ticked is the
  // kind of "success" that gets discovered a week later by a learner.
  if (wantsTemplate && !sourceTemplate) {
    return res.status(422).json({
      message: `${source.title} has no certificate design to copy.`,
    });
  }

  if (wantsEmail && !sourceEmail) {
    return res.status(422).json({
      message: `${source.title} has no certificate email to copy.`,
    });
  }

  const copied = [];

  if (sourceTemplate) {
    const values = {
      name: sourceTemplate.name,
      // By reference. See the note at the top of this file — nothing deletes a
      // background, so sharing the key between courses is safe.
      backgroundKey: sourceTemplate.backgroundKey,
      canvasWidth: sourceTemplate.canvasWidth,
      canvasHeight: sourceTemplate.canvasHeight,
      orientation: sourceTemplate.orientation,
      fields: sourceTemplate.fields,
      updatedBy: adminId,
    };

    const [template, created] = await FreeCourseCertificateTemplate.findOrCreate({
      where: { freeCourseId: courseId },
      defaults: { freeCourseId: courseId, ...values, createdBy: adminId },
    });

    if (!created) await template.update(values);

    copied.push("design");
  }

  if (sourceEmail) {
    const [template, created] = await FreeCourseEmailTemplate.findOrCreate({
      where: { freeCourseId: courseId, type: FREE_COURSE_EMAIL_TYPES.CERTIFICATE },
      defaults: {
        freeCourseId: courseId,
        type: FREE_COURSE_EMAIL_TYPES.CERTIFICATE,
        subject: sourceEmail.subject,
        body: sourceEmail.body,
        // Nothing to preserve on a brand-new row, so follow the source. On an
        // existing one the switch is left alone below.
        isEnabled: sourceEmail.isEnabled,
      },
    });

    if (!created) {
      // Content only. The send switch decides whether finishing this course
      // issues anything at all, and flipping that as a side effect of copying
      // wording would either arm a course nobody meant to arm or quietly
      // disarm a live one.
      await template.update({
        subject: sourceEmail.subject,
        body: sourceEmail.body,
      });
    }

    copied.push("email");
  }

  return res.status(200).json({
    message: `Copied the ${copied.join(" and ")} from ${source.title}`,
    data: { copied, from: { id: source.id, title: source.title } },
  });
});
