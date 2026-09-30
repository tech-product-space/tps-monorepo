import express from "express";

import { adminAuth } from "../../middlewares/adminAuth.middleware.js";

import {
  checkSlugAvailability,
  createRecording,
  deleteRecording,
  getRecordingById,
  listRecordings,
  toggleRecordingStatus,
  updateRecording,
} from "../../controllers/recording/crud.controller.js";

import {
  createCategory,
  deleteCategory,
  listCategories,
  reorderCategories,
  updateCategory,
} from "../../controllers/recording/category.controller.js";

import {
  getPublicRecordingBySlug,
  listPublicCategories,
  listPublicRecordings,
} from "../../controllers/recording/public.controller.js";

import {
  createRecordingLead,
  getWatchState,
  listRecordingLeads,
} from "../../controllers/recording/lead.controller.js";

import {
  createRecordingPreviewToken,
  verifyRecordingPreviewSession,
} from "../../controllers/recording/preview.controller.js";

import { authMiddleware } from "../../middlewares/auth.middleware.js";
import { previewAuth } from "../../middlewares/previewAuth.middleware.js";
import { previewLimiter } from "../../middlewares/rateLimit.middleware.js";

const router = express.Router();

// Base URL: /recordings
//
// No role gating anywhere in this file, deliberately. Recordings are content,
// and every content screen in the panel (Blog, Resources, Events, Jobs) is open
// to any authenticated admin. Courses restrict create/delete because a course
// carries pricing and enrolment leads; a recording does not.

/* ── admin: categories ──────────────────────────────────────────────────── */
// Declared before /admin/recordings/:id so "categories" can never be read as an
// id by a future route that shortens the path.
router.get("/admin/categories", adminAuth, listCategories);
router.post("/admin/categories", adminAuth, createCategory);
router.patch("/admin/categories/reorder", adminAuth, reorderCategories);
router.put("/admin/categories/:id", adminAuth, updateCategory);
router.delete("/admin/categories/:id", adminAuth, deleteCategory);

/* ── admin: recordings ──────────────────────────────────────────────────── */
router.get("/admin/slug-availability", adminAuth, checkSlugAvailability);
router.get("/admin/leads", adminAuth, listRecordingLeads);

// Events not already claimed by another recording — the event picker's source.

router.post("/admin/create", adminAuth, createRecording);
router.get("/admin/recordings", adminAuth, listRecordings);
router.get("/admin/recordings/:id", adminAuth, getRecordingById);
router.put("/admin/recordings/:id", adminAuth, updateRecording);
router.patch(
  "/admin/recordings/:id/toggle-status",
  adminAuth,
  toggleRecordingStatus,
);
router.delete("/admin/recordings/:id", adminAuth, deleteRecording);

/* ── preview ────────────────────────────────────────────────────────────── */
// See `../../controllers/recording/preview.controller.js`. Mint is admin-only;
// verify is public because the caller is the marketing site's route handler,
// which holds no admin credentials — the single-use launch token it presents is
// the credential. Both share the limiter: verify is the one unauthenticated
// surface here that takes a token, so it is the one that can be ground at.
router.post(
  "/admin/recordings/:id/preview-token",
  adminAuth,
  previewLimiter,
  createRecordingPreviewToken,
);

router.post("/preview/verify", previewLimiter, verifyRecordingPreviewSession);

/* ── public ─────────────────────────────────────────────────────────────── */
router.get("/public/categories", listPublicCategories);
router.get("/public/list", listPublicRecordings);
// `previewAuth` is optional: no token, or a token for another recording, and
// this stays exactly the endpoint it was — drafts 404 for the public.
router.get(
  "/public/slug/:slug",
  previewAuth("recording", "slug"),
  getPublicRecordingBySlug,
);

// The gate. The one endpoint that emits a video URL — see lead.controller.js.
/**
 * The gate, and both halves of it need an account.
 *
 * `authMiddleware`, not `optionalAuthMiddleware`: watching a gated recording
 * requires signing in, and the account is where the lead's identity comes from
 * — its email is the key `RecordingLeads` is unique on, so a request that could
 * arrive without one would have to trust a typed address instead.
 *
 * Neither route is on the path to an **ungated** recording. That switch still
 * means "plays for anybody": its video ships with the public page payload from
 * `public.controller.js`, and nothing here is consulted.
 */
router.get("/public/watch-state", authMiddleware, getWatchState);
router.post("/public/leads", authMiddleware, createRecordingLead);

export default router;
