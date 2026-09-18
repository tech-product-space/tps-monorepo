import db from "../../database/postgres/models/index.js";
import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { EMAIL_PROVIDER_ID, sendMail } from "../../services/email/index.js";
import {
  buildMergeValues,
  buildSubmissionValues,
  composeProjectEmail,
  resolveProjectEmail,
} from "../../services/project/projectEmail.service.js";
import {
  PROJECT_EMAIL_MERGE_FIELDS,
  PROJECT_EMAIL_TYPE,
  PROJECT_EMAIL_TYPE_LIST,
} from "../../config/constants/project.js";

const { Project, ProjectEmailTemplate } = db;

/**
 * The download email: one global template, overridable per project.
 *
 * The global and the override are rows in the same table — `projectId IS NULL`
 * is the global — so these endpoints serve both and the panel mounts one editor
 * component twice. See the model for why `NULL` was allowed to carry meaning,
 * and `resolveProjectEmail` for the rule it buys.
 */

const requireType = (req, res) => {
  const { type } = req.params;

  if (!PROJECT_EMAIL_TYPE_LIST.includes(type)) {
    res.status(400).json({ success: false, message: "Unknown email type" });
    return null;
  }

  return type;
};

export const getGlobalTemplate = asyncWrapper(async (req, res) => {
  const type = requireType(req, res);
  if (!type) return;

  const template = await ProjectEmailTemplate.findOne({
    where: { projectId: null, type },
  });

  return res.status(200).json({
    success: true,
    data: { template, mergeFields: PROJECT_EMAIL_MERGE_FIELDS[type] },
  });
});

export const upsertGlobalTemplate = asyncWrapper(async (req, res) => {
  const type = requireType(req, res);
  if (!type) return;

  const { subject, body } = req.body;

  if (!subject || !body) {
    return res
      .status(400)
      .json({ success: false, message: "Subject and body are required" });
  }

  const [template] = await ProjectEmailTemplate.findOrCreate({
    where: { projectId: null, type },
    defaults: {
      projectId: null,
      type,
      subject,
      body,
      isEnabled: req.body.isEnabled ?? true,
    },
  });

  await template.update({
    subject,
    body,
    isEnabled: req.body.isEnabled ?? template.isEnabled,
  });

  req.activity?.set({ entityLabel: template.subject });

  return res.status(200).json({ success: true, data: template });
});

/**
 * The per-project view returns **all three** — the override if one exists, the
 * global, and the resolved result.
 *
 * So the screen can show "inheriting the global" versus "overridden here"
 * without a second request, and without reimplementing the resolution rule in
 * TypeScript. `resolveProjectEmail` stays the only implementation.
 */
export const getProjectTemplate = asyncWrapper(async (req, res) => {
  const type = requireType(req, res);
  if (!type) return;

  const project = await Project.findByPk(req.params.projectId, {
    attributes: ["id"],
  });

  if (!project) {
    return res
      .status(404)
      .json({ success: false, message: "Project not found" });
  }

  const [override, global, resolved] = await Promise.all([
    ProjectEmailTemplate.findOne({ where: { projectId: project.id, type } }),
    ProjectEmailTemplate.findOne({ where: { projectId: null, type } }),
    resolveProjectEmail(project.id, type),
  ]);

  return res.status(200).json({
    success: true,
    data: {
      override,
      global,
      effective: resolved?.template ?? null,
      inheritedFromGlobal: resolved?.inheritedFromGlobal ?? null,
      mergeFields: PROJECT_EMAIL_MERGE_FIELDS[type],
    },
  });
});

export const upsertProjectTemplate = asyncWrapper(async (req, res) => {
  const type = requireType(req, res);
  if (!type) return;

  const project = await Project.findByPk(req.params.projectId, {
    attributes: ["id", "title"],
  });

  if (!project) {
    return res
      .status(404)
      .json({ success: false, message: "Project not found" });
  }

  const { subject, body } = req.body;

  if (!subject || !body) {
    return res
      .status(400)
      .json({ success: false, message: "Subject and body are required" });
  }

  const [template] = await ProjectEmailTemplate.findOrCreate({
    where: { projectId: project.id, type },
    defaults: {
      projectId: project.id,
      type,
      subject,
      body,
      isEnabled: req.body.isEnabled ?? true,
    },
  });

  await template.update({
    subject,
    body,
    isEnabled: req.body.isEnabled ?? template.isEnabled,
  });

  req.activity?.set({ entityLabel: `${project.title} — ${type}` });

  return res.status(200).json({ success: true, data: template });
});

/** Drops the override so the project falls back to the global. */
export const deleteProjectTemplate = asyncWrapper(async (req, res) => {
  const type = requireType(req, res);
  if (!type) return;

  const template = await ProjectEmailTemplate.findOne({
    where: { projectId: req.params.projectId, type },
  });

  if (!template) {
    return res
      .status(404)
      .json({ success: false, message: "This project has no override" });
  }

  req.activity?.set({ entityLabel: template.subject });

  await template.destroy();

  return res.status(200).json({
    success: true,
    message: "Override removed — this project now uses the global template",
  });
});

/**
 * Send one to yourself.
 *
 * Composed through `composeProjectEmail`, the same function the real sender
 * uses — a preview that renders through a second code path is not a preview.
 *
 * The sample values are obviously fake on purpose. A test send carrying a real
 * project's real download link, mailed to whoever typed an address into the
 * box, is a way to leak a gated link by accident.
 */
export const sendTestEmail = asyncWrapper(async (req, res) => {
  const type = requireType(req, res);
  if (!type) return;

  const { to, projectId } = req.body;

  if (!to) {
    return res
      .status(400)
      .json({ success: false, message: "An address is required" });
  }

  const resolved = await resolveProjectEmail(projectId ?? null, type);

  if (!resolved) {
    return res
      .status(404)
      .json({ success: false, message: "No template to send" });
  }

  const project = projectId
    ? await Project.findByPk(projectId, { attributes: ["title", "slug"] })
    : null;

  /**
   * The real title and slug, so the admin is checking their own copy against
   * the project they are editing — but never the real link. A test send goes
   * to whatever address was typed into the box, and a gated download link is
   * exactly the thing this section exists to not hand out for free.
   */
  const sample = {
    title: project?.title ?? "Sample Project",
    slug: project?.slug ?? "sample-project",
    downloadUrl: "https://example.com/sample-download",
  };

  // Each type substitutes from its own value builder — the same one its real
  // sender uses. A preview filled by a different builder is not a preview.
  const values =
    type === PROJECT_EMAIL_TYPE.SUBMISSION_ACK
      ? buildSubmissionValues({
          project: { ...sample, submitter: { name: "Sample Name" } },
        })
      : buildMergeValues({ project: sample, lead: { name: "Sample Name" } });

  const { subject, html } = composeProjectEmail(resolved.template, values);

  // Same sender as the real send, or the test proves nothing about how the
  // email arrives — the From line is half of what an admin is checking.
  const result = await sendMail({
    fromEmail: EMAIL_PROVIDER_ID.GD_NORP_MAIL,
    to,
    subject: `[Test] ${subject}`,
    html,
  });

  return res.status(200).json({
    success: true,
    data: { sent: Boolean(result?.success), error: result?.error ?? null },
  });
});
