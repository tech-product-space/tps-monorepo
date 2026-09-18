import db from "../../database/postgres/models/index.js";
import {
  BODIES,
  buildEmail,
  DEFAULT_SENDER_EMAIL,
  FOOTERS,
  HEADERS,
  sendMail,
} from "../email/index.js";
import capitalizeName from "../../util/helpers/capitalizeName.js";

const { CourseEmailTemplate } = db;

/**
 * Course mail — the enrollment acknowledgement and the brochure link — follows
 * DEFAULT_SENDER_EMAIL (.env) alongside the other transactional email, so the
 * sender moves in one place rather than drifting from the rest.
 *
 * Naming the sender explicitly rather than omitting it also keeps sendMail's
 * provider fallback off, so a failure here fails the email rather than quietly
 * arriving from a different address.
 */
const COURSE_FROM_EMAIL = DEFAULT_SENDER_EMAIL;

/**
 * Placeholders an admin may use in a course template. Surfaced to the editor in
 * the admin panel, so keep the two in step when adding one.
 *
 * Deliberately short: the brochure link is pasted in as a real link from the
 * Brochure tab rather than interpolated, so a template reads the same in the
 * editor as it does in the inbox.
 */
export const COURSE_EMAIL_VARIABLES = Object.freeze([
  "name",
  "email",
  "phone",
]);

/**
 * Values every template can interpolate. Missing fields become "" rather than
 * leaving a raw {{placeholder}} visible in a sent email.
 */
export const buildCourseEmailVariables = ({ lead = {} }) => ({
  name: capitalizeName(lead.name || ""),
  email: lead.email || "",
  phone: lead.phone ? `${lead.countryCode || ""} ${lead.phone}`.trim() : "",
});

/**
 * Sends one configured course email.
 *
 * Never throws: a template that is missing, disabled or fails to send must not
 * fail the request that triggered it, because that request has already captured
 * a lead and losing it would cost far more than a missing email.
 *
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
export const sendCourseEmail = async ({
  course,
  type,
  to,
  variables = {},
  templates,
}) => {
  try {
    const recipients = Array.isArray(to) ? to.filter(Boolean) : [to];

    if (recipients.length === 0) {
      return { sent: false, reason: "no recipient" };
    }

    // Callers that already loaded the course's templates pass them in, so a
    // single submission does not hit the table once per email.
    const template = templates
      ? templates.find((item) => item.type === type)
      : await CourseEmailTemplate.findOne({
          where: { courseId: course.id, type },
        });

    if (!template) {
      return { sent: false, reason: "template not configured" };
    }

    if (!template.isEnabled) {
      return { sent: false, reason: "template disabled" };
    }

    const html = buildEmail({
      body: BODIES.CUSTOM(template.body, variables),
      header: HEADERS.GRADIENT,
      footer: FOOTERS.GRADIENT,
    });

    const result = await sendMail({
      fromEmail: COURSE_FROM_EMAIL,
      to: recipients.join(","),
      subject: BODIES.CUSTOM(template.subject, variables),
      html,
    });

    if (!result?.success) {
      console.error("Course email failed", {
        courseId: course.id,
        type,
        error: result?.error,
      });
      return { sent: false, reason: result?.error || "send failed" };
    }

    return { sent: true };
  } catch (error) {
    console.error("Course email threw", { courseId: course?.id, type, error });
    return { sent: false, reason: error.message };
  }
};
