import express from "express";

import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { authMiddleware } from "../../middlewares/auth.middleware.js";

import {
  getTemplate,
  previewTemplate,
  upsertTemplate,
} from "../../controllers/freeCourseCertificate/template.controller.js";

import {
  getEmailTemplate,
  sendTestEmail,
  upsertEmailTemplate,
} from "../../controllers/freeCourseCertificate/email.controller.js";

import {
  copyFromCourse,
  listCopySources,
} from "../../controllers/freeCourseCertificate/copy.controller.js";

import {
  correctRecipient,
  generateCertificates,
  getLearners,
  getReadiness,
  listCertificates,
  resendCertificateEmail,
  restoreCertificate,
  retryCertificate,
  revokeCertificate,
} from "../../controllers/freeCourseCertificate/issue.controller.js";

import {
  downloadMyCourseCertificate,
  ensureMyCourseCertificate,
  getMyCourseCertificates,
  getMyCourseCertificateStatus,
} from "../../controllers/freeCourseCertificate/public.controller.js";

const router = express.Router();

// BASE URL -> /free-courses/certificates

// ── Signed-in learner ─────────────────────────────────────────────────────
// There is no public certificate page and no lookup by number. A certificate is
// reachable only by the person it belongs to, signed in, and the download
// returns the PDF's bytes — no storage URL is ever handed out.
//
// Identity comes from the cookie on every one of these. No route reads a user
// id from the body, the query or the path, so there is no version of these
// requests that mints or fetches a certificate in somebody else's name.
router.get("/mine", authMiddleware, getMyCourseCertificates);
router.post("/mine/:courseId/ensure", authMiddleware, ensureMyCourseCertificate);
router.get(
  "/mine/:courseId/status",
  authMiddleware,
  getMyCourseCertificateStatus,
);
router.get(
  "/mine/:certificateNo/download",
  authMiddleware,
  downloadMyCourseCertificate,
);

// ── Admin: per-certificate ────────────────────────────────────────────────
// Declared before the :courseId routes so "certificates" is never swallowed as
// a course id.
router.post("/admin/certificates/:id/retry", adminAuth, retryCertificate);
router.post("/admin/certificates/:id/resend", adminAuth, resendCertificateEmail);
router.patch("/admin/certificates/:id/revoke", adminAuth, revokeCertificate);
router.patch("/admin/certificates/:id/restore", adminAuth, restoreCertificate);
router.patch("/admin/certificates/:id/recipient", adminAuth, correctRecipient);

// ── Admin: design and email ───────────────────────────────────────────────
router.get("/admin/:courseId/template", adminAuth, getTemplate);
router.put("/admin/:courseId/template", adminAuth, upsertTemplate);
router.post("/admin/:courseId/preview", adminAuth, previewTemplate);

router.get("/admin/:courseId/email", adminAuth, getEmailTemplate);
router.put("/admin/:courseId/email", adminAuth, upsertEmailTemplate);
// Sends the email on screen, not the saved one — see the controller.
router.post("/admin/:courseId/email/test", adminAuth, sendTestEmail);

// Most free courses share a design and an email; building each from scratch is
// how they drift apart.
router.get("/admin/:courseId/copy-sources", adminAuth, listCopySources);
router.post("/admin/:courseId/copy", adminAuth, copyFromCourse);

// ── Admin: issuance ───────────────────────────────────────────────────────
router.get("/admin/:courseId/readiness", adminAuth, getReadiness);
router.get("/admin/:courseId/learners", adminAuth, getLearners);
router.post("/admin/:courseId/generate", adminAuth, generateCertificates);
router.get("/admin/:courseId/certificates", adminAuth, listCertificates);

export default router;
