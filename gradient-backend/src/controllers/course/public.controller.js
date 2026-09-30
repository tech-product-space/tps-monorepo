import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { createLeadRecord } from "../../services/lead/createLead.service.js";
import {
  COURSE_EMAIL_TYPES,
  COURSE_LEAD_SUB_SOURCE,
} from "../../config/constants/course.js";
import {
  buildCourseEmailVariables,
  sendCourseEmail,
} from "../../services/course/courseEmail.service.js";
import {
  buildBrochureLink,
  resolveStorageUrl,
} from "../../util/helpers/courseLinks.js";
import { derivePricingDisplay } from "../../util/helpers/coursePricing.js";

const { Course } = db;

const findPublishedCourse = (slug) =>
  Course.findOne({ where: { slug, isPublished: true } });

/**
 * Everything a course page is allowed to know. Templates and the raw file key
 * are deliberately absent — this route is open to the world.
 */
export const getPublicCourseConfig = asyncWrapper(async (req, res) => {
  const { slug } = req.params;

  const course = await findPublishedCourse(slug);

  // A missing or unpublished course is not an error for the caller: the site
  // falls back to the values compiled into the page, so it still renders.
  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found",
    });
  }

  const hasBrochure = Boolean(course.brochure?.fileKey);

  return res.status(200).json({
    success: true,
    data: {
      slug: course.slug,
      name: course.name,
      // Formatted here rather than on the site, so one place decides how a
      // price reads and the discount badge always matches the figure.
      pricing: derivePricingDisplay(course.pricing),
      // The site shows its curriculum CTA on `available` alone — uploading a
      // brochure is what puts the button live.
      brochure: {
        available: hasBrochure,
        url: hasBrochure ? buildBrochureLink(req, course.slug) : "",
      },
    },
  });
});

/** Fields a public form may contribute to the lead record. */
const pickLeadFields = (body) => ({
  name: body.name,
  email: body.email,
  phone: body.phone,
  countryCode: body.countryCode,
  pageUrl: body.pageUrl,
  referrer: body.referrer,
  utmId: body.utmId,
  utmSource: body.utmSource,
  utmMedium: body.utmMedium,
  utmCampaign: body.utmCampaign,
  utmTerm: body.utmTerm,
  utmContent: body.utmContent,
  additionalData: body.additionalData || {},
});

export const createCourseEnrollment = asyncWrapper(async (req, res) => {
  const { slug } = req.params;
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({
      success: false,
      message: "name and email are required",
    });
  }

  const course = await findPublishedCourse(slug);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found",
    });
  }

  const lead = await createLeadRecord({
    ...pickLeadFields(req.body),
    source: course.slug,
    sourceDisplayName: course.name,
    ...COURSE_LEAD_SUB_SOURCE.ENROLLMENT,
    courseId: course.id,
    additionalData: {
      ...(req.body.additionalData || {}),
      programTitle: course.name,
    },
  });

  // Swallows its own failures, so a mail outage can never lose the lead that
  // was just captured above.
  await sendCourseEmail({
    course,
    type: COURSE_EMAIL_TYPES.ENROLLMENT_ACK,
    to: lead.email,
    variables: buildCourseEmailVariables({ lead }),
  });

  return res.status(201).json({
    success: true,
    message: "Enrollment received",
  });
});

export const requestCourseBrochure = asyncWrapper(async (req, res) => {
  const { slug } = req.params;
  const { name, email } = req.body;

  if (!name || !email) {
    return res.status(400).json({
      success: false,
      message: "name and email are required",
    });
  }

  const course = await findPublishedCourse(slug);

  if (!course) {
    return res.status(404).json({
      success: false,
      message: "Course not found",
    });
  }

  if (!course.brochure?.fileKey) {
    return res.status(404).json({
      success: false,
      message: "No brochure available for this course",
    });
  }

  const lead = await createLeadRecord({
    ...pickLeadFields(req.body),
    source: course.slug,
    sourceDisplayName: course.name,
    ...COURSE_LEAD_SUB_SOURCE.BROCHURE,
    courseId: course.id,
    additionalData: {
      ...(req.body.additionalData || {}),
      programTitle: course.name,
    },
  });

  await sendCourseEmail({
    course,
    type: COURSE_EMAIL_TYPES.BROCHURE_DOWNLOAD,
    to: lead.email,
    variables: buildCourseEmailVariables({ lead }),
  });

  // The link comes back as well as being emailed: the email is the record that
  // keeps the lead warm, the direct link is what stops them bouncing.
  return res.status(201).json({
    success: true,
    message: "Brochure sent",
    data: { brochureUrl: buildBrochureLink(req, course.slug) },
  });
});

/**
 * Stable brochure permalink. Resolves to whichever file is currently uploaded,
 * so links already pasted into email templates survive a re-upload.
 */
export const downloadCourseBrochure = asyncWrapper(async (req, res) => {
  const { slug } = req.params;

  const course = await Course.findOne({ where: { slug } });

  if (!course?.brochure?.fileKey) {
    return res.status(404).json({
      success: false,
      message: "No brochure available for this course",
    });
  }

  return res.redirect(302, resolveStorageUrl(course.brochure.fileKey));
});
