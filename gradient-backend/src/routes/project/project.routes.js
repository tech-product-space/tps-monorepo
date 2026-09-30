import express from "express";

import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { previewAuth } from "../../middlewares/previewAuth.middleware.js";
import { submissionLimiter } from "../../middlewares/rateLimit.middleware.js";

import {
  checkSlugAvailability,
  createProject,
  deleteProject,
  getProjectById,
  listProjects,
  toggleProjectStatus,
  updateProject,
} from "../../controllers/project/crud.controller.js";

import {
  createCategory,
  deleteCategory,
  listCategories,
  reorderCategories,
  updateCategory,
} from "../../controllers/project/category.controller.js";

import {
  checkStepSlugAvailability,
  createStep,
  deleteStep,
  getStepById,
  importSteps,
  listSteps,
  publishAllSteps,
  reorderSteps,
  toggleStepStatus,
  updateStep,
} from "../../controllers/project/step.controller.js";

import {
  getPublicProjectBySlug,
  getPublicStep,
  listPublicCategories,
  listPublicProjects,
} from "../../controllers/project/public.controller.js";

import {
  createProjectLead,
  getGatePrefill,
  listProjectLeads,
  unlockProjectGuide,
} from "../../controllers/project/lead.controller.js";

import { reviewProject } from "../../controllers/project/review.controller.js";
import { submitProject } from "../../controllers/project/submission.controller.js";

import {
  completeStep,
  getProjectProgress,
} from "../../controllers/project/progress.controller.js";

import {
  deleteProjectTemplate,
  getGlobalTemplate,
  getProjectTemplate,
  sendTestEmail,
  upsertGlobalTemplate,
  upsertProjectTemplate,
} from "../../controllers/project/emailTemplate.controller.js";

const router = express.Router();

// Base URL: /projects
//
// No role gating anywhere in this file, deliberately. Projects are content,
// like Blog, Resources and Recordings, and every content screen in the panel is
// open to any authenticated admin. Courses restrict create/delete because a
// course carries pricing and enrolment leads; a project does not.

/* ── admin: categories ──────────────────────────────────────────────────── */
// Declared before /admin/projects/:id so "categories" can never be read as an
// id by a future route that shortens the path.
router.get("/admin/categories", adminAuth, listCategories);
router.post("/admin/categories", adminAuth, createCategory);
router.patch("/admin/categories/reorder", adminAuth, reorderCategories);
router.put("/admin/categories/:id", adminAuth, updateCategory);
router.delete("/admin/categories/:id", adminAuth, deleteCategory);

/* ── admin: email templates ─────────────────────────────────────────────── */
// The global pair. The per-project override lives under /admin/projects/:id
// below and goes through the same table — see projectEmail.service.js.
router.get("/admin/email-templates/:type", adminAuth, getGlobalTemplate);
router.put("/admin/email-templates/:type", adminAuth, upsertGlobalTemplate);
router.post("/admin/email-templates/:type/test", adminAuth, sendTestEmail);

/* ── admin: leads and slugs ─────────────────────────────────────────────── */
// Both before /admin/projects/:id for the same reason as categories.
router.get("/admin/slug-availability", adminAuth, checkSlugAvailability);
router.get("/admin/leads", adminAuth, listProjectLeads);

/* ── admin: steps ───────────────────────────────────────────────────────── */
// The collection routes are nested under their project; the item routes are
// not, because a step id is unique on its own and threading the project id
// through every edit URL only creates a second thing that can disagree.
router.get("/admin/projects/:projectId/steps", adminAuth, listSteps);
router.post("/admin/projects/:projectId/steps", adminAuth, createStep);
router.put("/admin/projects/:projectId/steps/reorder", adminAuth, reorderSteps);
// The .docx importer. A POST of already-converted steps, not a file upload —
// the panel does the conversion so the images go through the upload endpoint.
router.post("/admin/projects/:projectId/steps/import", adminAuth, importSteps);
router.patch(
  "/admin/projects/:projectId/steps/publish-all",
  adminAuth,
  publishAllSteps,
);
router.get(
  "/admin/projects/:projectId/steps/slug-availability",
  adminAuth,
  checkStepSlugAvailability,
);
router.get("/admin/steps/:id", adminAuth, getStepById);
router.put("/admin/steps/:id", adminAuth, updateStep);
router.patch("/admin/steps/:id/toggle-status", adminAuth, toggleStepStatus);
router.delete("/admin/steps/:id", adminAuth, deleteStep);

/* ── admin: per-project email override ──────────────────────────────────── */
router.get(
  "/admin/projects/:projectId/email/:type",
  adminAuth,
  getProjectTemplate,
);
router.put(
  "/admin/projects/:projectId/email/:type",
  adminAuth,
  upsertProjectTemplate,
);
router.delete(
  "/admin/projects/:projectId/email/:type",
  adminAuth,
  deleteProjectTemplate,
);

/* ── admin: projects ────────────────────────────────────────────────────── */
router.post("/admin/create", adminAuth, createProject);
router.get("/admin/projects", adminAuth, listProjects);
router.get("/admin/projects/:id", adminAuth, getProjectById);
router.put("/admin/projects/:id", adminAuth, updateProject);
router.patch("/admin/projects/:id/toggle-status", adminAuth, toggleProjectStatus);
// The only writer of the moderation state. Separate from PUT on purpose — see
// review.controller.js.
router.post("/admin/projects/:id/review", adminAuth, reviewProject);
router.delete("/admin/projects/:id", adminAuth, deleteProject);

/* ── public ─────────────────────────────────────────────────────────────── */
router.get("/public/categories", listPublicCategories);
router.get("/public/list", listPublicProjects);

// `previewAuth` is optional: no token, or a token for another project, and this
// stays exactly the endpoint it was — drafts and unreviewed submissions 404 for
// the public.
router.get(
  "/public/slug/:slug",
  previewAuth("project", "slug"),
  getPublicProjectBySlug,
);
router.get(
  "/public/slug/:slug/steps/:stepSlug",
  previewAuth("project", "slug"),
  getPublicStep,
);

/**
 * The gate. The one endpoint that emits a download URL — see lead.controller.js.
 *
 * **No `authMiddleware`**, unlike the recordings gate. A typed name, email and
 * phone is the identity here; asking for a sign-up before a free download would
 * cost more conversions than the extra certainty is worth. `req.user` is read
 * opportunistically when a session happens to be present.
 *
 * Rate limited because it is a public endpoint that writes a row.
 */
router.post("/public/download", submissionLimiter, createProjectLead);

/**
 * The guide gate — the same form as the download, releasing the steps past the
 * free ones instead of the link. Rate limited for the same reason: a public
 * endpoint that writes a row.
 */
router.post("/public/guide-unlock", submissionLimiter, unlockProjectGuide);
router.get("/public/gate-prefill", getGatePrefill);

/** Community contributions. Rate limited for the same reason. */
router.post("/public/submit", submissionLimiter, submitProject);

/**
 * Progress — the only two endpoints here that need an account.
 *
 * The guide itself is public: it is the reason the download is worth wanting,
 * and hiding it behind a sign-up puts the sales pitch behind the counter. Only
 * the ticks and the resume point are gated, and both read the user from the
 * session rather than from the request body.
 */
router.get("/public/slug/:slug/progress", authMiddleware, getProjectProgress);
router.post("/public/steps/:id/complete", authMiddleware, completeStep);

export default router;
