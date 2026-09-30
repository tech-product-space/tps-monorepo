const express = require("express");
const router = express.Router();

const { authenticate, requireRole } = require('../middlewares/auth.middleware');
const { ROLES } = require('../config/constants/roles');
const uploadPaymentProof = require('../middlewares/uploadPaymentProof');
const { PROOF_MAX_FILES } = require('../config/constants/payment');

const paymentController = require("../controllers/payment/payment.controller");
const crudController = require("../controllers/payment/crud.controller");
const listController = require("../controllers/payment/list.controller");
const verificationController = require("../controllers/payment/verification.controller");
const leadCourseController = require("../controllers/payment/leadCourse.controller");
const metaController = require("../controllers/payment/meta.controller");
const documentController = require("../controllers/document.controller");

// Who may approve/reject a manual payment, and who may merely watch the queue.
// Managers get read-only visibility of their own team's pending payments.
const VERIFIERS = [ROLES.SUPERADMIN, ROLES.PROGRAM_MANAGER];
const QUEUE_VIEWERS = [...VERIFIERS, ROLES.MANAGER];

// BASE URL -> /payment

// Currency + provider metadata (drive the enroll + collect dropdowns).
router.get("/enroll-currencies", authenticate, metaController.enrollCurrencies);
router.get("/providers", authenticate, metaController.providers);

// Razorpay payment-link generation: used when the collect-payment flow selects
// "razorpay" as the source. Bank transfer / Cashfree are recorded manually via
// /record (marked paid immediately).
router.post("/generate-link", authenticate, paymentController.createPaymentLink);
router.post("/cancel-link", authenticate, paymentController.cancelPaymentLink);

// Manual payment recording. Deliberately open to every authenticated role —
// Agents record their own collections and verification is the control on it.
// Accepts optional multipart proof files; a body with no files stays JSON.
router.post(
  "/record",
  authenticate,
  uploadPaymentProof.array("attachments", PROOF_MAX_FILES),
  paymentController.recordPayment,
);

// Global payments list. Open to every role — each is scoped server-side to what
// they recorded, the same way /enrollments and /invoices are gated.
router.get("/list", authenticate, listController.list);

// CSV extract of the same list. Superadmin only, matching the lead export.
router.get("/export", authenticate, requireRole([ROLES.SUPERADMIN]), listController.exportCsv);

// Manual-payment verification queue.
router.get("/verifications", authenticate, requireRole(QUEUE_VIEWERS), verificationController.list);
router.get("/verifications/summary", authenticate, requireRole(QUEUE_VIEWERS), verificationController.summary);
router.post("/verifications/:id/verify", authenticate, requireRole(VERIFIERS), verificationController.verify);
router.post("/verifications/:id/reject", authenticate, requireRole(VERIFIERS), verificationController.reject);

// Withdraw your own pending payment. Deliberately NOT requireRole(VERIFIERS) —
// this is open to every role that can record a payment, because the control on
// it is ownership, not rank: the service refuses unless the caller is the one
// who recorded it. Verify/reject/cancel all race for the same row and the
// first write wins; the losers get a 409 naming the outcome.
router.post("/verifications/:id/cancel", authenticate, verificationController.cancel);

// Lean status read for a single payment, meant to be polled while a gateway
// link is outstanding (the enrollment wizard sits on this). Registered after
// every literal two-segment route above so /verifications/summary still wins.
router.get("/:paymentId/status", authenticate, crudController.getPaymentStatus);

// Proof files. Not verifier-gated — access is checked per payment instead, so
// an agent can see proof on their own leads but nobody else's.
router.get(
  "/:paymentId/attachments/:attachmentId/url",
  authenticate,
  verificationController.getAttachmentUrl,
);

router.get("/overview/profile/:profileId", authenticate, crudController.getProfilePaymentOverview);
router.get("/list/profile/:profileId", authenticate, crudController.listProfilePayments);
router.get("/list/course/:leadCourseId", authenticate, crudController.listCoursePayments);

// Lead Course routes
router.post("/enroll-course", authenticate, leadCourseController.enrollCourse);
router.get("/courses/profile/:profileId", authenticate, leadCourseController.getProfileCourses);
router.put("/courses/agent-discount", authenticate, leadCourseController.updateAgentDiscount);

// REMOVED: PUT /courses/details and PUT /courses/cohort.
//
// Both assigned a cohort with no role check and no scope check, so any
// signed-in user — an Agent included — could move any enrollment to any cohort,
// leaving nothing behind but a one-line activity entry. Cohort changes now go
// through POST /enrollments/:id/change-cohort, which is Superadmin/PM only,
// scope-checked, and recorded as a deferral. See COHORT_DEFERRAL_PLAN.md.

// Course onboarding email. Restricted to the same roles that verify payments:
// onboarding follows the money, so whoever confirms the money owns the send.
// The service additionally refuses until the enrollment has a paid payment.
router.post(
  "/onboarding/course/:leadCourseId/send",
  authenticate,
  requireRole(VERIFIERS),
  leadCourseController.sendOnboarding,
);

// Document routes — PDF download + email send
// Receipt (per payment)
router.get("/receipt/:paymentId/download", authenticate, documentController.downloadReceipt);
router.post("/receipt/:paymentId/send", authenticate, documentController.sendReceipt);

// GST Invoice (per enrollment)
router.post("/invoice/course/:leadCourseId/issue", authenticate, documentController.issueInvoice);
router.get("/invoice/course/:leadCourseId/download", authenticate, documentController.downloadInvoice);
router.post("/invoice/course/:leadCourseId/send", authenticate, documentController.sendInvoice);
router.get("/invoice/course/:leadCourseId/info", authenticate, documentController.getInvoiceInfo);

// Statement (per enrollment, any time)
router.get("/statement/course/:leadCourseId/download", authenticate, documentController.downloadStatement);

module.exports = router;