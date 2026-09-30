import express from "express";

import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

import {
  getTemplate,
  previewTemplate,
  upsertTemplate,
} from "../../controllers/eventCertificate/template.controller.js";

import {
  approveCertificates,
  correctRecipient,
  createRecipients,
  getReadiness,
  getRecipients,
  issueForFeedbacks,
  listCertificates,
  restoreCertificate,
  retryCertificate,
  revokeCertificate,
} from "../../controllers/eventCertificate/issue.controller.js";

import {
  downloadMyCertificate,
  getMyCertificates,
} from "../../controllers/eventCertificate/public.controller.js";

const router = express.Router();

// BASE URL -> /events/certificates

// ── Signed-in recipient ───────────────────────────────────────────────────
// There is no public certificate page and no lookup by number. A certificate is
// reachable only by the person it belongs to, from their dashboard, and the
// download returns the PDF's bytes — no storage URL is ever handed out.
router.get("/public/mine", authMiddleware, getMyCertificates);
router.get(
  "/public/mine/:certificateNo/download",
  authMiddleware,
  downloadMyCertificate,
);

// ── Template ──────────────────────────────────────────────────────────────
router.get("/admin/:eventId/template", adminAuth, getTemplate);
router.put("/admin/:eventId/template", adminAuth, upsertTemplate);
router.post("/admin/:eventId/preview", adminAuth, previewTemplate);

// ── Issuance ──────────────────────────────────────────────────────────────
// Per-certificate routes are declared before the :eventId ones so that
// "certificates" is never swallowed as an event id.
router.post("/admin/certificates/:id/retry", adminAuth, retryCertificate);
router.patch("/admin/certificates/:id/revoke", adminAuth, revokeCertificate);
router.patch("/admin/certificates/:id/restore", adminAuth, restoreCertificate);
router.patch("/admin/certificates/:id/recipient", adminAuth, correctRecipient);

router.get("/admin/:eventId/readiness", adminAuth, getReadiness);
router.get("/admin/:eventId/recipients", adminAuth, getRecipients);
router.post("/admin/:eventId/recipients", adminAuth, createRecipients);
router.patch("/admin/:eventId/approve", adminAuth, approveCertificates);
// Issue against the responses that earned them — the Feedback tab's Generate.
router.post("/admin/:eventId/feedback/issue", adminAuth, issueForFeedbacks);
router.get("/admin/:eventId/certificates", adminAuth, listCertificates);

export default router;
