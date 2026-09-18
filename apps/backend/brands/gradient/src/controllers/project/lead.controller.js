import { Op } from "sequelize";

import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { getMeta, getPaginationParams } from "../../util/helpers/pagination.js";
import { sendProjectDownloadEmail } from "../../services/project/projectEmail.service.js";
import { findCarryableProfile } from "../../services/project/projectProfile.service.js";
import {
  PROJECT_LEAD_SOURCE,
  projectUnlockCookieName,
  publishedProjectScope,
  resolveProjectSettings,
} from "../../config/constants/project.js";
import {
  signProjectUnlock,
  unlockCookieOptions,
  verifyProjectUnlock,
} from "../../util/projectUnlock.util.js";

const { Project, ProjectCategory, ProjectLead } = db;

/**
 * The download gate.
 *
 * **This file is the only place `downloadUrl` reaches the public.**
 * `public.controller.js` strips it from every payload while the project is
 * gated. A GitHub link is not a secret, but shipping it in the page payload and
 * hiding the button in React would make the gate decorative and the download
 * number fiction.
 */

const normaliseEmail = (email) => String(email ?? "").trim().toLowerCase();

/**
 * Writes the one row this person has for this project, and hands back the
 * unlock that opens both doors.
 *
 * **One gate, two doors.** The download and the guide ask for the same three
 * fields about the same project, so they share a row and a cookie: passing
 * either one releases the other. Asking somebody who just typed their email to
 * read step 2 for the same email again to press Download is the kind of thing
 * that makes a page feel broken.
 *
 * `stamp` is the column for the door they came through, so the panel can still
 * tell the two apart.
 */
const passGate = async ({ project, req, res, details, stamp }) => {
  const { name, email, phone, countryCode } = details;
  const normalisedEmail = normaliseEmail(email);

  const existing = await ProjectLead.findOne({
    where: { projectId: project.id, email: normalisedEmail },
  });

  let lead;

  if (existing) {
    /**
     * A repeat is an update, not a duplicate — see the note in the model. No
     * hooks fire on an update, so nothing re-emits and nobody is re-enrolled in
     * a workflow for opening the guide on their phone.
     */
    await existing.update({
      name,
      phone,
      countryCode: countryCode ?? existing.countryCode,
      // A human just typed these, so the freshness clock restarts.
      detailsConfirmedAt: new Date(),
      lastSubmittedAt: new Date(),
      submissionCount: existing.submissionCount + 1,
      userId: req.user?.id ?? existing.userId,
      [stamp]: new Date(),
    });

    lead = existing;
  } else {
    lead = await ProjectLead.create({
      projectId: project.id,
      // Opportunistic: set when the request happens to carry a session. Neither
      // gate requires one.
      userId: req.user?.id ?? null,
      name,
      email: normalisedEmail,
      phone,
      countryCode,
      source: PROJECT_LEAD_SOURCE.FORM,
      detailsConfirmedAt: new Date(),
      lastSubmittedAt: new Date(),
      [stamp]: new Date(),
    });
  }

  res.cookie(
    projectUnlockCookieName(project.id),
    signProjectUnlock({ projectId: project.id, leadId: lead.id }),
    unlockCookieOptions(),
  );

  return lead;
};

/**
 * The lead this browser already has for this project, if any.
 *
 * Two ways to be recognised, in order: the signed cookie, then the session.
 * The account check is what carries an unlock to a second device — the cookie
 * cannot.
 */
const findPassedLead = async (project, req) => {
  const claim = verifyProjectUnlock(
    req.cookies?.[projectUnlockCookieName(project.id)],
    project.id,
  );

  if (claim?.leadId) {
    const lead = await ProjectLead.findOne({
      where: { id: claim.leadId, projectId: project.id },
    });
    if (lead) return lead;
  }

  if (req.user?.id) {
    return ProjectLead.findOne({
      where: { projectId: project.id, userId: req.user.id },
    });
  }

  return null;
};

export const createProjectLead = asyncWrapper(async (req, res) => {
  const { projectSlug, name, email, phone, countryCode } = req.body;

  const project = await Project.findOne({
    where: { slug: projectSlug, ...publishedProjectScope() },
    include: [
      { model: ProjectCategory, as: "category", attributes: ["id", "slug"] },
    ],
  });

  if (!project) {
    return res
      .status(404)
      .json({ success: false, message: "Project not found" });
  }

  if (!project.downloadUrl) {
    return res.status(409).json({
      success: false,
      message: "This project has no download link yet.",
    });
  }

  // An ungated project asks for nothing and records nothing. That switch means
  // "downloads for anybody", and writing a lead row for somebody who was never
  // shown a form would be inventing consent.
  if (!resolveProjectSettings(project).gateDownload) {
    return res
      .status(200)
      .json({ success: true, data: { downloadUrl: project.downloadUrl } });
  }

  /**
   * Already through this project's gate — by the guide, or by downloading it
   * before — so no form, and the button just works.
   *
   * The row is stamped and counted as a download either way, and the delivery
   * email goes out either way: this *is* a download, and it is the second door
   * on the same gate, not a free pass. Skipping the mail here was the reason a
   * reader who had already unlocked the guide got the link on screen and
   * nothing in their inbox.
   */
  const passed = await findPassedLead(project, req);

  let lead;

  if (passed) {
    await passed.update({
      downloadedAt: new Date(),
      lastSubmittedAt: new Date(),
    });
    lead = passed;
  } else {
    if (!name || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: "Name, email and phone are required",
      });
    }

    lead = await passGate({
      project,
      req,
      res,
      details: { name, email, phone, countryCode },
      stamp: "downloadedAt",
    });
  }

  // Gate passes, not people. Rendered nowhere — see the model.
  await project.increment("downloadCount");

  /**
   * Fire-and-forget in effect: `sendProjectDownloadEmail` never throws and
   * never rejects, and the link is already in the response below. A mail outage
   * must not turn a working download into a 500, or into a spinner while SES
   * times out.
   */
  const emailResult = await sendProjectDownloadEmail({ project, lead });

  return res.status(200).json({
    success: true,
    data: {
      downloadUrl: project.downloadUrl,
      emailed: emailResult.sent,
    },
  });
});

/**
 * The guide gate — the same form, the other door.
 *
 * Returns no download link. Unlocking the guide and taking the file are
 * different intents, and the button for the second one is right there; handing
 * out the URL to somebody who asked to read step 2 would make the download
 * count meaningless.
 */
export const unlockProjectGuide = asyncWrapper(async (req, res) => {
  const { projectSlug, name, email, phone, countryCode } = req.body;

  const project = await Project.findOne({
    where: { slug: projectSlug, ...publishedProjectScope() },
    attributes: ["id", "slug", "title", "settings"],
  });

  if (!project) {
    return res
      .status(404)
      .json({ success: false, message: "Project not found" });
  }

  // Nothing to unlock. Answering "fine" rather than erroring keeps a project
  // whose gate was switched off mid-read from stranding whoever was reading it.
  if (!resolveProjectSettings(project).gateGuide) {
    return res.status(200).json({ success: true, data: { unlocked: true } });
  }

  const passed = await findPassedLead(project, req);

  if (passed) {
    await passed.update({ guideUnlockedAt: passed.guideUnlockedAt ?? new Date() });

    // Re-issued so a browser holding nothing but a session still ends up with
    // a cookie — otherwise every step would re-check the account.
    res.cookie(
      projectUnlockCookieName(project.id),
      signProjectUnlock({ projectId: project.id, leadId: passed.id }),
      unlockCookieOptions(),
    );

    return res.status(200).json({ success: true, data: { unlocked: true } });
  }

  if (!name || !email || !phone) {
    return res.status(400).json({
      success: false,
      message: "Name, email and phone are required",
    });
  }

  await passGate({
    project,
    req,
    res,
    details: { name, email, phone, countryCode },
    stamp: "guideUnlockedAt",
  });

  return res.status(200).json({ success: true, data: { unlocked: true } });
});

/**
 * Prefill for the gate form — so a second project is one click.
 *
 * Returns nothing rather than an error when there is no carryable profile: not
 * knowing somebody is the normal case, and a 404 here would make the frontend
 * treat a first-time visitor as a failure.
 */
export const getGatePrefill = asyncWrapper(async (req, res) => {
  const profile = await findCarryableProfile({
    userId: req.user?.id,
    email: req.query.email,
  });

  return res.status(200).json({ success: true, data: { profile } });
});

export const listProjectLeads = asyncWrapper(async (req, res) => {
  const { page, limit, offset } = getPaginationParams(req.query);
  const { projectId, q } = req.query;

  const where = {};

  if (projectId) where.projectId = projectId;

  if (q) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${q}%` } },
      { email: { [Op.iLike]: `%${q}%` } },
      { phone: { [Op.iLike]: `%${q}%` } },
    ];
  }

  const { rows, count } = await ProjectLead.findAndCountAll({
    where,
    include: [
      {
        model: Project,
        as: "project",
        attributes: ["id", "title", "slug"],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit,
    offset,
    distinct: true,
  });

  return res.status(200).json({
    success: true,
    data: rows,
    meta: getMeta(count, page, limit),
  });
});
