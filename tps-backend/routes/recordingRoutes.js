const express = require("express");
const router = express.Router();

const previewAuth = require("../middlewares/previewAuth");
const requireStaff = require("../middlewares/requireStaff");
const requireUser = require("../middlewares/requireUser");

const {
  checkSlugAvailability,
  createRecording,
  deleteRecording,
  getRecordingById,
  listRecordings,
  toggleRecordingStatus,
  updateRecording,
} = require("../controllers/recording/crudController");

const {
  createCategory,
  deleteCategory,
  listCategories,
  reorderCategories,
  updateCategory,
} = require("../controllers/recording/categoryController");

const {
  getPublicRecordingBySlug,
  listPublicCategories,
  listPublicRecordings,
} = require("../controllers/recording/publicController");

const {
  createRecordingLead,
  getWatchState,
  listRecordingLeads,
} = require("../controllers/recording/leadController");

const {
  createRecordingPreviewToken,
  verifyRecordingPreviewSession,
} = require("../controllers/recording/previewController");

// Base URL: /recordings
//
// No role gating within the admin half, deliberately: recordings are content,
// and every content screen in the panel is open to any authenticated staff
// member. `requireStaff` is on every admin route all the same — the lead list
// behind it is personal data, and "the panel does not link to it" is not access
// control.

/* ── admin: categories ──────────────────────────────────────────────────── */
// Declared before /admin/recordings/:id so "categories" can never be read as an
// id by a future route that shortens the path.
router.get("/admin/categories", requireStaff, listCategories);
router.post("/admin/categories", requireStaff, createCategory);
router.patch("/admin/categories/reorder", requireStaff, reorderCategories);
router.put("/admin/categories/:id", requireStaff, updateCategory);
router.delete("/admin/categories/:id", requireStaff, deleteCategory);

/* ── admin: recordings ──────────────────────────────────────────────────── */
router.get("/admin/slug-availability", requireStaff, checkSlugAvailability);
router.get("/admin/leads", requireStaff, listRecordingLeads);

router.post("/admin/create", requireStaff, createRecording);
router.get("/admin/recordings", requireStaff, listRecordings);
router.get("/admin/recordings/:id", requireStaff, getRecordingById);
router.put("/admin/recordings/:id", requireStaff, updateRecording);
router.patch(
  "/admin/recordings/:id/toggle-status",
  requireStaff,
  toggleRecordingStatus
);
router.delete("/admin/recordings/:id", requireStaff, deleteRecording);

/* ── preview ────────────────────────────────────────────────────────────── */
// See `../controllers/recording/previewController.js`. Mint is staff-only;
// verify is deliberately not, because the caller is the public site's own route
// handler and the single-use launch token it presents is the credential.
router.post(
  "/admin/recordings/:id/preview-token",
  requireStaff,
  createRecordingPreviewToken
);

router.post("/preview/verify", verifyRecordingPreviewSession);

/* ── public ─────────────────────────────────────────────────────────────── */
router.get("/public/categories", listPublicCategories);
router.get("/public/list", listPublicRecordings);

// `previewAuth` is optional: no token, a token for another recording, or an
// expired one, and this stays the endpoint every visitor already gets. Only the
// detail read takes one — a draft must not surface in a listing even to the
// person drafting it.
router.get(
  "/public/slug/:slug",
  previewAuth("recording"),
  getPublicRecordingBySlug
);

// The gate. The only endpoints that emit a video URL — see leadController.js.
//
// `requireUser`, not `optionalUser`: watching a gated recording needs an
// account. That is what makes the nine-field form bearable — the answers are
// carried onto every later recording, and the carry has to key on something
// stable, which an editable email address is not.
//
// An **ungated** recording reaches neither of these. Its video ships with the
// page payload, so nothing here is on the path a visitor takes to one.
router.get("/public/watch-state", requireUser, getWatchState);
router.post("/public/leads", requireUser, createRecordingLead);

module.exports = router;
