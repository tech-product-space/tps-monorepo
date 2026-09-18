import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { COURSE_EMAIL_TYPE_LIST } from "../../config/constants/course.js";
import {
  buildCourseEmailVariables,
  COURSE_EMAIL_VARIABLES,
  sendCourseEmail,
} from "../../services/course/courseEmail.service.js";
import { buildBrochureLink } from "../../util/helpers/courseLinks.js";

const { Course, CourseEmailTemplate } = db;

export const listCourseEmailTemplates = asyncWrapper(async (req, res) => {
  const { id } = req.params;

  const course = await Course.findByPk(id);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found",
    });
  }

  const templates = await CourseEmailTemplate.findAll({
    where: { courseId: id },
  });

  const byType = new Map(templates.map((item) => [item.type, item]));

  // Every known type comes back, configured or not, so the admin renders one
  // card per email without having to know which rows exist yet.
  return res.status(200).json({
    success: true,
    data: COURSE_EMAIL_TYPE_LIST.map((type) => {
      const template = byType.get(type);

      return {
        type,
        subject: template?.subject || "",
        body: template?.body || "",
        isEnabled: template ? template.isEnabled : false,
        isConfigured: Boolean(template),
        updatedAt: template?.updatedAt || null,
      };
    }),
    meta: {
      variables: COURSE_EMAIL_VARIABLES,
      brochureLink: buildBrochureLink(req, course.slug),
    },
  });
});

export const upsertCourseEmailTemplate = asyncWrapper(async (req, res) => {
  const { id, type } = req.params;
  const { subject, body, isEnabled = true } = req.body;

  if (!COURSE_EMAIL_TYPE_LIST.includes(type)) {
    return res.status(400).json({
      success: false,
      message: `Unknown template type. Expected one of: ${COURSE_EMAIL_TYPE_LIST.join(", ")}`,
    });
  }

  if (!subject || typeof subject !== "string") {
    return res.status(400).json({
      success: false,
      message: "subject is required",
    });
  }

  if (!body || typeof body !== "string") {
    return res.status(400).json({
      success: false,
      message: "body is required",
    });
  }

  const course = await Course.findByPk(id);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found",
    });
  }

  const existing = await CourseEmailTemplate.findOne({
    where: { courseId: id, type },
  });

  if (existing) {
    await existing.update({ subject, body, isEnabled });
  } else {
    await CourseEmailTemplate.create({
      courseId: id,
      type,
      subject,
      body,
      isEnabled,
    });
  }

  return res.status(200).json({
    success: true,
    message: "Template saved",
  });
});

/**
 * Sends the saved template to one address so an admin can see the real thing
 * before it reaches applicants.
 */
export const sendTestCourseEmail = asyncWrapper(async (req, res) => {
  const { id, type } = req.params;
  const { to } = req.body;

  if (!to) {
    return res.status(400).json({
      success: false,
      message: "to is required",
    });
  }

  if (!COURSE_EMAIL_TYPE_LIST.includes(type)) {
    return res.status(400).json({
      success: false,
      message: "Unknown template type",
    });
  }

  const course = await Course.findByPk(id);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found",
    });
  }

  // Stand-in lead so every placeholder resolves to something recognisable
  // rather than rendering blank in the test.
  const sampleLead = {
    name: "Sample Applicant",
    email: to,
    phone: "9876543210",
    countryCode: "+91",
  };

  const result = await sendCourseEmail({
    course,
    type,
    to,
    variables: buildCourseEmailVariables({ lead: sampleLead }),
  });

  if (!result.sent) {
    return res.status(422).json({
      success: false,
      message: `Test email not sent: ${result.reason}`,
    });
  }

  return res.status(200).json({
    success: true,
    message: `Test email sent to ${to}`,
  });
});
