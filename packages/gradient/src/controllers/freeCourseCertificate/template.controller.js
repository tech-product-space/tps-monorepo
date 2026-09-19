import db from "../../database/postgres/models/index.js";
const { FreeCourse, FreeCourseCertificateTemplate } = db;

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import {
  CERTIFICATE_FONT_FAMILIES,
  CERTIFICATE_FONT_WEIGHTS,
  CERTIFICATE_LEGACY_WEIGHTS,
  CERTIFICATE_ORIENTATION,
} from "../../config/constants/certificate.js";
import { FREE_COURSE_CERTIFICATE_FIELD_KEYS } from "../../config/constants/freeCourseCertificate.js";
import {
  PREVIEW_DATA,
  renderFreeCourseCertificate,
} from "../../services/freeCourse/certificateRender.service.js";

const VALID_FIELD_KEYS = Object.values(FREE_COURSE_CERTIFICATE_FIELD_KEYS);
const VALID_ALIGNMENTS = ["left", "center", "right"];
const VALID_ORIENTATIONS = Object.values(CERTIFICATE_ORIENTATION);

/**
 * Orientation is optional on the wire; an omitted one is derived from the
 * canvas rather than defaulted, so an older client cannot flip a portrait
 * certificate to landscape just by not knowing about the field.
 */
const resolveRequestOrientation = (orientation, canvasWidth, canvasHeight) => {
  if (VALID_ORIENTATIONS.includes(orientation)) return orientation;

  return canvasWidth >= canvasHeight
    ? CERTIFICATE_ORIENTATION.LANDSCAPE
    : CERTIFICATE_ORIENTATION.PORTRAIT;
};

/**
 * Validate the field list.
 *
 * Worth being strict here rather than at render time: a template is designed
 * once and then used for every learner, so a bad field is not one broken
 * certificate, it is all of them.
 */
const validateFields = (fields) => {
  if (!Array.isArray(fields) || fields.length === 0) {
    return "At least one field is required.";
  }

  const hasName = fields.some(
    (f) => f.key === FREE_COURSE_CERTIFICATE_FIELD_KEYS.RECIPIENT_NAME,
  );

  if (!hasName) {
    return "The certificate must include the recipient's name.";
  }

  const seen = new Set();

  for (const field of fields) {
    if (!VALID_FIELD_KEYS.includes(field.key)) {
      return `Unknown field "${field.key}".`;
    }

    // Two boxes for the same placeholder means the value is drawn twice, which
    // is never intended and looks like a rendering bug when it happens.
    if (seen.has(field.key)) {
      return `Field "${field.key}" appears more than once.`;
    }
    seen.add(field.key);

    for (const axis of ["x", "y"]) {
      const value = field[axis];
      if (typeof value !== "number" || value < 0 || value > 100) {
        return `Field "${field.key}" has an invalid ${axis} (expected 0-100).`;
      }
    }

    if (typeof field.fontSize !== "number" || field.fontSize < 6) {
      return `Field "${field.key}" has an invalid font size.`;
    }

    if (field.align && !VALID_ALIGNMENTS.includes(field.align)) {
      return `Field "${field.key}" has an invalid alignment.`;
    }

    if (field.fontFamily && !CERTIFICATE_FONT_FAMILIES.includes(field.fontFamily)) {
      return `Font "${field.fontFamily}" is not available.`;
    }

    if (
      field.fontWeight !== undefined &&
      field.fontWeight !== null &&
      !(field.fontWeight in CERTIFICATE_LEGACY_WEIGHTS) &&
      !CERTIFICATE_FONT_WEIGHTS.includes(Number(field.fontWeight))
    ) {
      return `Field "${field.key}" has an invalid font weight.`;
    }
  }

  return null;
};

/**
 * GET /free-courses/certificates/admin/:courseId/template
 */
export const getTemplate = asyncWrapper(async (req, res) => {
  const { courseId } = req.params;

  const template = await FreeCourseCertificateTemplate.findOne({
    where: { freeCourseId: courseId },
  });

  if (!template) {
    return res.status(404).json({ message: "Certificate template not found" });
  }

  return res.status(200).json({ data: template });
});

/**
 * PUT /free-courses/certificates/admin/:courseId/template
 */
export const upsertTemplate = asyncWrapper(async (req, res) => {
  const { courseId } = req.params;
  const { name, backgroundKey, canvasWidth, canvasHeight, fields } = req.body;

  const adminId = req.admin?.id || null;

  if (!name || !backgroundKey || !canvasWidth || !canvasHeight) {
    return res.status(400).json({
      message: "name, backgroundKey, canvasWidth and canvasHeight are required",
    });
  }

  if (req.body.orientation && !VALID_ORIENTATIONS.includes(req.body.orientation)) {
    return res.status(422).json({
      message: `Orientation must be one of ${VALID_ORIENTATIONS.join(", ")}.`,
    });
  }

  const orientation = resolveRequestOrientation(
    req.body.orientation,
    canvasWidth,
    canvasHeight,
  );

  const course = await FreeCourse.findByPk(courseId, { attributes: ["id"] });

  if (!course) {
    return res.status(404).json({ message: "Course not found" });
  }

  const fieldError = validateFields(fields);

  if (fieldError) {
    return res.status(422).json({ message: fieldError });
  }

  const [template, created] = await FreeCourseCertificateTemplate.findOrCreate({
    where: { freeCourseId: courseId },
    defaults: {
      freeCourseId: courseId,
      name,
      backgroundKey,
      canvasWidth,
      canvasHeight,
      orientation,
      fields,
      createdBy: adminId,
      updatedBy: adminId,
    },
  });

  if (!created) {
    await template.update({
      name,
      backgroundKey,
      canvasWidth,
      canvasHeight,
      orientation,
      fields,
      updatedBy: adminId,
    });
  }

  return res.status(200).json({
    message: created ? "Template created" : "Template updated",
    data: template,
  });
});

/**
 * POST /free-courses/certificates/admin/:courseId/preview
 *
 * Renders the real artifact with sample data and returns it inline. Nothing is
 * persisted.
 *
 * Deliberately server-side rather than a canvas in the browser: the admin needs
 * to see what learners will actually get, and the two diverge exactly where it
 * matters — fonts. A browser has the designer's system fonts; the server has
 * only what is bundled.
 *
 * Accepts an unsaved template in the body so the editor can preview before
 * committing.
 */
export const previewTemplate = asyncWrapper(async (req, res) => {
  const { courseId } = req.params;

  const course = await FreeCourse.findByPk(courseId, {
    attributes: ["id", "title"],
  });

  if (!course) {
    return res.status(404).json({ message: "Course not found" });
  }

  let template = req.body?.backgroundKey ? req.body : null;

  if (template) {
    const fieldError = validateFields(template.fields);
    if (fieldError) {
      return res.status(422).json({ message: fieldError });
    }

    if (template.orientation && !VALID_ORIENTATIONS.includes(template.orientation)) {
      return res.status(422).json({
        message: `Orientation must be one of ${VALID_ORIENTATIONS.join(", ")}.`,
      });
    }
  } else {
    template = await FreeCourseCertificateTemplate.findOne({
      where: { freeCourseId: courseId },
    });
  }

  if (!template) {
    return res.status(404).json({ message: "Certificate template not found" });
  }

  const { pdf, warnings } = await renderFreeCourseCertificate({
    template,
    data: { ...PREVIEW_DATA, courseTitle: course.title },
  });

  // Warnings ride in a header so the body stays a plain PDF the browser can put
  // straight into an <embed>. Silent substitution is the failure this whole
  // endpoint exists to prevent, so it must not be swallowed here.
  if (warnings.length) {
    res.setHeader("X-Certificate-Warnings", JSON.stringify(warnings));
    res.setHeader("Access-Control-Expose-Headers", "X-Certificate-Warnings");
  }

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="preview.pdf"');

  return res.send(pdf);
});
