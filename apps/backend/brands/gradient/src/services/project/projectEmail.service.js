import db from "../../database/postgres/models/index.js";
import { EMAIL_PROVIDER_ID, sendMail } from "../email/index.js";
import {
  BODIES,
  FOOTERS,
  HEADERS,
  buildEmail,
} from "../email/templates/index.js";
import { PROJECT_EMAIL_TYPE } from "../../config/constants/project.js";
import env from "../../config/env.js";

const { ProjectEmailTemplate } = db;

/**
 * Which template applies to this project, and whether it is on.
 *
 * **The only reader of `ProjectEmailTemplates`.** `projectId IS NULL` means
 * "the global default", and that is a piece of knowledge that must live in
 * exactly one function — a second implementation of the rule elsewhere is how
 * one project quietly starts mailing the wrong copy.
 *
 * Three outcomes, in order:
 *
 *   1. An override for this project → use it, `isEnabled` and all.
 *   2. Otherwise the global → use it.
 *   3. Neither → `null`, meaning send nothing. Not an error.
 *
 * **An override with `isEnabled: false` means "no email for this project"**,
 * even when the global is on. That is what "override" has to mean; without it
 * there is no way to switch the email off for one project, and the admin's only
 * recourse is saving an empty body — which sends a blank email.
 *
 * @returns {Promise<{template: object, inheritedFromGlobal: boolean}|null>}
 */
export const resolveProjectEmail = async (
  projectId,
  type = PROJECT_EMAIL_TYPE.DOWNLOAD_DELIVERY,
) => {
  const [override, global] = await Promise.all([
    projectId
      ? ProjectEmailTemplate.findOne({ where: { projectId, type } })
      : Promise.resolve(null),
    ProjectEmailTemplate.findOne({ where: { projectId: null, type } }),
  ]);

  const template = override ?? global;

  if (!template) return null;

  return { template, inheritedFromGlobal: !override };
};

/**
 * The public URL of a project's guide, for the `{{projectUrl}}` tag.
 *
 * `/projects/<slug>` — the site redirects that to the guide's first step, so
 * the link survives steps being reordered or the first one being renamed.
 *
 * Not `/projects/<category>/<slug>`: there is no such route. The site's second
 * segment is a step slug, and the category listing lives under
 * `/projects/category/<slug>` — a link built the other way 404s in somebody's
 * inbox, which is the one place nobody is watching for it.
 */
export const buildProjectUrl = (project) => {
  const base = (env.publicSiteUrl ?? "").replace(/\/+$/, "");

  return `${base}/projects/${project.slug}`;
};

/**
 * The values behind `{{name}}`, `{{projectTitle}}`, `{{downloadUrl}}` and
 * `{{projectUrl}}`.
 *
 * Exported so the admin's test send fills the same tags the real send does —
 * a preview that substitutes a different set is not a preview.
 */
export const buildMergeValues = ({ project, lead }) => ({
  name: lead?.name ?? "there",
  projectTitle: project?.title ?? "",
  downloadUrl: project?.downloadUrl ?? "",
  projectUrl: project ? buildProjectUrl(project) : "",
});

/**
 * Composes one project email of any type. No sending — so the test-send
 * endpoint and the real sender compose through the same code and cannot drift.
 *
 * Substitution is `BODIES.CUSTOM`, the registry's admin-authored-HTML body,
 * which already replaces `{{tag}}` against a values object. The subject goes
 * through it too: `buildEmail` only wraps the body, and a subject line reading
 * "Your {{projectTitle}} project files" in somebody's inbox is the one place
 * this mistake is most visible.
 */
export const composeProjectEmail = (template, values) => ({
  subject: BODIES.CUSTOM(template.subject, values),
  html: buildEmail({
    body: BODIES.CUSTOM(template.body, values),
    header: HEADERS.GRADIENT,
    // Transactional, so the plain footer. Not GRADIENT_MARKETING — that one
    // carries an unsubscribe link, and unsubscribing from a file you asked for
    // is not a thing anybody can do.
    footer: FOOTERS.GRADIENT,
  }),
});

/**
 * Sends the download email, if one resolves and is enabled.
 *
 * **Never throws, and never blocks the download.** `sendMail` already resolves
 * `{ success: false }` rather than rejecting, and everything around it here is
 * wrapped too: the caller has written the lead and is about to return the link,
 * and a mail outage must not turn a working download into a 500. The person
 * has the link in the response either way.
 *
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
export const sendProjectDownloadEmail = async ({ project, lead }) => {
  try {
    const resolved = await resolveProjectEmail(
      project.id,
      PROJECT_EMAIL_TYPE.DOWNLOAD_DELIVERY,
    );

    if (!resolved) return { sent: false, reason: "no-template" };
    if (!resolved.template.isEnabled) return { sent: false, reason: "disabled" };

    const { subject, html } = composeProjectEmail(
      resolved.template,
      buildMergeValues({ project, lead }),
    );

    /**
     * Pinned to the noreply identity rather than inheriting
     * DEFAULT_SENDER_EMAIL. This is an automated delivery nobody should reply
     * to, and it must not start going out as info@ the day somebody changes
     * that .env value for a different reason.
     */
    const result = await sendMail({
      fromEmail: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
      to: lead.email,
      subject,
      html,
    });

    return { sent: Boolean(result?.success), reason: result?.error };
  } catch (error) {
    // Deliberately swallowed — see the doc comment above.
    console.error("[projectEmail] send failed", error);

    return { sent: false, reason: error.message };
  }
};

/**
 * The values behind a submission acknowledgement's tags.
 *
 * `projectLink` is what the submitter typed, echoed back. There is no
 * `projectUrl` to offer: the project is unreviewed and unpublished, and a link
 * to it would 404 — or, worse, imply it is live.
 */
export const buildSubmissionValues = ({ project }) => ({
  name: project?.submitter?.name ?? "there",
  projectTitle: project?.title ?? "",
  projectLink: project?.downloadUrl ?? "",
});

/**
 * Tells a community submitter we have their project.
 *
 * **Never throws, and never blocks the submission.** Same contract as the
 * download mail and for the same reason: the row is already written and the
 * thank-you screen is already true. A mail outage must not turn a received
 * contribution into a 500 that invites somebody to submit it twice.
 *
 * @returns {Promise<{sent: boolean, reason?: string}>}
 */
export const sendProjectSubmissionAck = async ({ project }) => {
  try {
    const email = project?.submitter?.email;

    if (!email) return { sent: false, reason: "no-address" };

    const resolved = await resolveProjectEmail(
      null,
      PROJECT_EMAIL_TYPE.SUBMISSION_ACK,
    );

    // Global only — `resolveProjectEmail` is passed a null projectId on
    // purpose. A per-project override is meaningless here: the project did not
    // exist until a moment ago, so nobody could have written one for it.
    if (!resolved) return { sent: false, reason: "no-template" };
    if (!resolved.template.isEnabled) return { sent: false, reason: "disabled" };

    const { subject, html } = composeProjectEmail(
      resolved.template,
      buildSubmissionValues({ project }),
    );

    const result = await sendMail({
      fromEmail: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
      to: email,
      subject,
      html,
    });

    return { sent: Boolean(result?.success), reason: result?.error };
  } catch (error) {
    console.error("[projectEmail] submission ack failed", error);

    return { sent: false, reason: error.message };
  }
};
