const verificationService = require("../../services/paymentVerification.service");
const { Payment } = require("../../models");
const { canVerifyPayments } = require("../../config/constants/roles");
const { assertLeadCourseInScope } = require("../../utils/documentScope");
const { getScopedUserIds } = require("../../utils/dashboardScope");

/** Normalize `?agentId=a&agentId=b` and `?agentId=a,b` into an array. */
function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((v) => String(v).split(","));
  return String(value).split(",");
}

function readFilters(query) {
  return {
    agentIds: toArray(query.agentId).map((s) => s.trim()).filter(Boolean),
    q: query.q,
    source: query.source,
    leadCourseId: query.leadCourseId,
    from: query.from,
    to: query.to,
    minAmount: query.minAmount,
    maxAmount: query.maxAmount,
  };
}

function sendError(res, error, fallback) {
  const status = error.statusCode || 400;
  if (status >= 500) console.error(fallback, error);
  return res.status(status).json({
    success: false,
    message: error.message || fallback,
    code: error.code || undefined,
    details: error.details || undefined,
  });
}

exports.list = async (req, res) => {
  try {
    const result = await verificationService.listPendingVerifications({
      user: req.user,
      filters: readFilters(req.query),
      query: req.query,
    });

    res.json({
      success: true,
      ...result,
      // The queue is read-only for Managers; the client hides the actions.
      canVerify: canVerifyPayments(req.user.role),
    });
  } catch (error) {
    sendError(res, error, "Failed to load pending verifications");
  }
};

exports.summary = async (req, res) => {
  try {
    const summary = await verificationService.getPendingVerificationSummary({
      user: req.user,
      filters: {},
    });

    res.json({ success: true, data: summary });
  } catch (error) {
    sendError(res, error, "Failed to load verification summary");
  }
};

exports.verify = async (req, res) => {
  try {
    const payment = await verificationService.verifyPayment({
      paymentId: req.params.id,
      verifierId: req.user.id,
      allowOverCollection: req.body?.allowOverCollection === true,
    });

    res.json({
      success: true,
      message: "Payment verified — it now counts towards collections.",
      data: payment,
    });
  } catch (error) {
    sendError(res, error, "Failed to verify payment");
  }
};

exports.reject = async (req, res) => {
  try {
    const payment = await verificationService.rejectPayment({
      paymentId: req.params.id,
      verifierId: req.user.id,
      reason: req.body?.reason,
    });

    res.json({
      success: true,
      message: "Payment rejected.",
      data: payment,
    });
  } catch (error) {
    sendError(res, error, "Failed to reject payment");
  }
};

/**
 * Withdraw your own pending payment. Not role-gated on the route — the service
 * checks that the caller recorded it, which is a stricter test than any role
 * would be (a Superadmin cannot cancel an Agent's entry here; they reject it).
 */
exports.cancel = async (req, res) => {
  try {
    const payment = await verificationService.cancelPayment({
      paymentId: req.params.id,
      actorId: req.user.id,
      reason: req.body?.reason,
    });

    res.json({
      success: true,
      message: "Payment cancelled — it never counted towards collections.",
      data: payment,
    });
  } catch (error) {
    sendError(res, error, "Failed to cancel payment");
  }
};

/**
 * Authorize a viewer against a payment's proof files.
 *
 * Proof screenshots carry the customer's bank details, so access is checked
 * before any URL is signed:
 *   - verifiers (global scope) see everything;
 *   - the person who recorded the payment always sees their own;
 *   - otherwise the payment's enrollment must be in the caller's scope.
 * A payment with no enrollment falls back to recorder-or-verifier only.
 */
async function assertProofAccess(user, payment) {
  if (canVerifyPayments(user.role)) return;

  if (String(payment.created_by).toLowerCase() === String(user.id).toLowerCase()) return;

  if (payment.lead_course_id) {
    await assertLeadCourseInScope(user, payment.lead_course_id);
    return;
  }

  const scoped = await getScopedUserIds(user);
  if (scoped === null) return;

  throw Object.assign(new Error("You do not have access to this attachment."), {
    statusCode: 403,
  });
}

exports.getAttachmentUrl = async (req, res) => {
  try {
    const { paymentId, attachmentId } = req.params;

    const payment = await Payment.findByPk(paymentId, {
      attributes: ["id", "created_by", "lead_course_id"],
      raw: true,
    });
    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    await assertProofAccess(req.user, payment);

    const data = await verificationService.getAttachmentUrl({
      paymentId,
      attachmentId,
      download: req.query.download === "1" || req.query.download === "true",
    });

    res.json({ success: true, data });
  } catch (error) {
    sendError(res, error, "Failed to load attachment");
  }
};
