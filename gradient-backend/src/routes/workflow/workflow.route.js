import express from "express";

import {
  listWorkflows,
  getWorkflow,
  createWorkflow,
  updateWorkflow,
  validateWorkflowEndpoint,
  publishWorkflow,
  pauseWorkflow,
  resumeWorkflow,
  archiveWorkflow,
  duplicateWorkflow,
  sendTestEmail,
} from "../../controllers/workflow/crud.controller.js";
import {
  listEnrollments,
  getEnrollment,
  cancelEnrollment,
  bulkCancelEnrollments,
} from "../../controllers/workflow/enrollment.controller.js";
import {
  runWorkflow,
  getRunStatus,
  previewAudience,
  enrolOne,
  getHealth,
  getConditionOptions,
} from "../../controllers/workflow/run.controller.js";
import { getWorkflowReport } from "../../controllers/workflow/report.controller.js";
import {
  getSettings,
  updateSettings,
} from "../../controllers/workflow/settings.controller.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

const router = express.Router();

// BASE URL -> /workflows

/**
 * Every route here is admin-only, and it is worth saying why out loud rather
 * than relying on the panel to hide things: this API can put a workflow live
 * that emails thousands of people with no further click. `POST
 * /admin/workflows/:id/publish` is the most consequential verb in the system.
 *
 * `adminAuth` proves a valid admin token and nothing more — it does no role
 * check. If workflows should ever be Super-Admin-only, that is `requireRole`
 * here, the same way `/activity-logs` does it.
 */

/* ── health ─── the first thing to check when a workflow "did not fire" ── */
router.get("/admin/health", adminAuth, getHealth);

/* ── what an if/then step can ask about ────────────────────────────────── */
router.get("/admin/conditions", adminAuth, getConditionOptions);

/* ── settings ─── literal paths, so they win over /:id ─────────────────── */
router.get("/admin/settings", adminAuth, getSettings);
router.put("/admin/settings", adminAuth, updateSettings);

/* ── enrolments ────────────────────────────────────────────────────────── */
router.get("/admin/enrollments", adminAuth, listEnrollments);
// Before /:id, so the literal segment matches first.
router.post("/admin/enrollments/bulk-cancel", adminAuth, bulkCancelEnrollments);
router.get("/admin/enrollments/:id", adminAuth, getEnrollment);
router.post("/admin/enrollments/:id/cancel", adminAuth, cancelEnrollment);

/* ── workflows ─────────────────────────────────────────────────────────── */
router.get("/admin/workflows", adminAuth, listWorkflows);
router.post("/admin/workflows", adminAuth, createWorkflow);

// Composing a step's email needs a test send before the workflow exists, so
// this is registered without an id as well as with one.
router.post("/admin/workflows/test-email", adminAuth, sendTestEmail);

router.get("/admin/workflows/:id", adminAuth, getWorkflow);
router.put("/admin/workflows/:id", adminAuth, updateWorkflow);
router.delete("/admin/workflows/:id", adminAuth, archiveWorkflow);

router.post("/admin/workflows/:id/validate", adminAuth, validateWorkflowEndpoint);
router.post("/admin/workflows/:id/publish", adminAuth, publishWorkflow);
router.post("/admin/workflows/:id/pause", adminAuth, pauseWorkflow);
router.post("/admin/workflows/:id/resume", adminAuth, resumeWorkflow);
router.post("/admin/workflows/:id/duplicate", adminAuth, duplicateWorkflow);
router.post("/admin/workflows/:id/test-email", adminAuth, sendTestEmail);

/* ── running ───────────────────────────────────────────────────────────── */
router.get("/admin/workflows/:id/audience", adminAuth, previewAudience);
router.get("/admin/workflows/:id/report", adminAuth, getWorkflowReport);
router.post("/admin/workflows/:id/run", adminAuth, runWorkflow);
router.get("/admin/workflows/:id/run-status", adminAuth, getRunStatus);
router.post("/admin/workflows/:id/enroll", adminAuth, enrolOne);

export default router;
