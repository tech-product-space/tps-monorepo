import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { isPublicHttpUrl } from "../../util/helpers/url.js";
import { sendProjectSubmissionAck } from "../../services/project/projectEmail.service.js";
import {
  PROJECT_LEVEL_LIST,
  PROJECT_SOURCE,
  PROJECT_STATUS,
} from "../../config/constants/project.js";

const { Project, ProjectCategory } = db;

/**
 * "Submit Your Project" — the public contribution form.
 *
 * **An allowlist, not a denylist.** The endpoint reads exactly the fields below
 * and ignores everything else on the body: `content`, `seo`, `isPublished`,
 * `status`, `source`, `thumbnail`, `relatedProjectIds`, `downloadCount`,
 * `reviewedByAdminId`. A submitter does not get to publish themselves, and
 * enumerating what they *may* send is the only version of that rule which stays
 * correct when a column is added later.
 *
 * **`submitter.email` is not a `ProjectLeads` row.** Submitting is not
 * downloading; conflating them would put contributors into a download audience
 * they never joined.
 */

const toStringList = (value) =>
  Array.isArray(value)
    ? [...new Set(value.map((v) => String(v).trim()).filter(Boolean))].slice(
        0,
        20,
      )
    : [];

/**
 * A slug the submitter does not choose, de-duplicated with a numeric suffix.
 *
 * Nothing is reachable at it until an admin publishes, so a collision is not
 * urgent — but a submitted row still occupies the unique index, so the suffix
 * is not optional either. Without it the second person to submit "Todo App"
 * gets a 500 from a constraint they cannot see.
 */
const buildUniqueSlug = async (title) => {
  const base =
    String(title)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "project";

  const existing = await Project.findAll({
    where: { slug: { [Op.like]: `${base}%` } },
    attributes: ["slug"],
    raw: true,
  });

  const taken = new Set(existing.map((r) => r.slug));

  if (!taken.has(base)) return base;

  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;

  return `${base}-${suffix}`;
};

/**
 * An optional profile link: absent is fine, present must be a real http(s) URL.
 *
 * The same `javascript:` reasoning as the download link — these are pasted by
 * the public and rendered straight into an `href` in the review queue, so a
 * scheme we do not vet is a stored XSS aimed at an admin. Returns the trimmed
 * string, or `null` for absent, or `false` for "present and not a URL", which
 * the caller turns into a 400.
 */
const optionalProfileUrl = (value) => {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  return isPublicHttpUrl(value) ? String(value).trim() : false;
};

export const submitProject = asyncWrapper(async (req, res) => {
  const { title, summary, categoryId, downloadUrl, level, submitter } =
    req.body;

  if (!title || !summary) {
    return res
      .status(400)
      .json({ success: false, message: "Title and summary are required" });
  }

  if (!submitter?.name || !submitter?.email) {
    return res.status(400).json({
      success: false,
      message: "Your name and email are required so we can credit you",
    });
  }

  // Refused here rather than at publish, because the submitter is the only
  // person who can fix it and they are still on the page.
  if (!isPublicHttpUrl(downloadUrl)) {
    return res.status(400).json({
      success: false,
      message: "Add a valid project link (http or https)",
    });
  }

  /**
   * Required, like the project link.
   *
   * A submission without a write-up is a repo and a sentence, and the guide
   * gets reverse-engineered from the code by somebody who did not build it.
   * Asking for it here — where the person who did build it is still on the
   * page — is the difference between a guide and a transcription.
   */
  if (!isPublicHttpUrl(req.body.submittedGuideUrl)) {
    return res.status(400).json({
      success: false,
      message:
        "Add a link to your write-up — a README, a blog post or a walkthrough (http or https)",
    });
  }

  const submittedGuideUrl = String(req.body.submittedGuideUrl).trim();

  if (level && !PROJECT_LEVEL_LIST.includes(level)) {
    return res.status(400).json({ success: false, message: "Unknown level" });
  }

  const githubUrl = optionalProfileUrl(submitter.githubUrl);
  const linkedinUrl = optionalProfileUrl(submitter.linkedinUrl);

  if (githubUrl === false) {
    return res.status(400).json({
      success: false,
      message: "That GitHub link does not look like a URL",
    });
  }

  if (linkedinUrl === false) {
    return res.status(400).json({
      success: false,
      message: "That LinkedIn link does not look like a URL",
    });
  }

  const category = await ProjectCategory.findByPk(categoryId, {
    attributes: ["id"],
  });

  if (!category) {
    return res
      .status(400)
      .json({ success: false, message: "Pick a category for your project" });
  }

  const project = await Project.create({
    title,
    slug: await buildUniqueSlug(title),
    summary,
    categoryId: category.id,
    level: level ?? null,
    downloadUrl,
    prerequisites: toStringList(req.body.prerequisites),
    submittedGuideUrl,
    skills: toStringList(req.body.skills),
    status: PROJECT_STATUS.SUBMITTED,
    source: PROJECT_SOURCE.COMMUNITY,
    isPublished: false,
    submitter: {
      name: submitter.name,
      email: String(submitter.email).trim().toLowerCase(),
      phone: submitter.phone ?? null,
      githubUrl,
      linkedinUrl,
      note: submitter.note ?? null,
    },
  });

  /**
   * The acknowledgement, which may not break the submission.
   *
   * The sender swallows its own failures — the row is written, the thank-you
   * screen is already true, and a mail outage must not turn a received
   * contribution into a 500 that invites somebody to send it twice.
   *
   * Awaited rather than left dangling: an unawaited rejection in an Express
   * handler is an unhandled rejection, and this finishes well inside the time
   * the response takes to render anyway.
   */
  const ack = await sendProjectSubmissionAck({ project });

  // Deliberately minimal: the submitter gets an id and nothing that would let
  // them poll for a decision. They are told on screen that a human reviews it.
  return res.status(201).json({
    success: true,
    message:
      "Thanks — your project is with our team. We'll review it before it goes live.",
    data: { id: project.id, emailed: ack.sent },
  });
});
