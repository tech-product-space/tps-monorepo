const paymentService = require("../../services/payment.service");
const { Payment } = require("../../models");
const { assertCanCancelPayment } = require("../../utils/documentScope");

exports.createPaymentLink = async (req, res) => {
  try {

    const { leadProfileId, amount, description, expiry, offerId, leadCourseId, source, purpose } = req.body;

    const link = await paymentService.generatePaymentLink({
      leadProfileId,
      userId: req.user.id,
      amount,
      description,
      expiry,
      offerId,
      leadCourseId,
      source,
      // Which ledger the link collects against. Omitted = the course fee, which
      // is what every existing caller means.
      ...(purpose ? { purpose } : {}),
    });

    res.status(201).json({
      data: {
        paymentLink: link.short_url,
        // Lets a caller watch this specific link settle via
        // GET /payment/:paymentId/status. Additive — existing callers read
        // paymentLink alone and are unaffected.
        paymentId: link.payment_id,
      }
    });

  } catch (error) {
    console.error("Create payment link error:", error);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to create payment link"
    });
  }
};

exports.recordPayment = async (req, res) => {
  try {
    const {
      leadProfileId,
      amount,
      source,
      reference,
      note,
      description,
      leadCourseId,
      paidAt,
      supersedesPaymentId,
      purpose,
    } = req.body;

    if (!leadProfileId) {
      return res.status(400).json({
        success: false,
        message: "leadProfileId is required",
      });
    }

    // When proof files are attached the request is multipart, so every field
    // arrives as a string — coerce anything the service expects as a number.
    const payment = await paymentService.recordManualPayment({
      leadProfileId,
      userId: req.user.id,
      amount: typeof amount === "string" ? Number(amount) : amount,
      source,
      reference,
      note,
      description,
      leadCourseId: leadCourseId || null,
      paidAt,
      supersedesPaymentId: supersedesPaymentId || null,
      // Which ledger this money settles — the course fee, or an outstanding
      // deferral fee. Omitted = course fee, so existing callers are unaffected.
      ...(purpose ? { purpose } : {}),
      files: req.files || [],
    });

    res.status(201).json({
      success: true,
      message:
        "Payment submitted for verification. It will count once an Admin approves it.",
      data: payment,
    });
  } catch (error) {
    console.error("Record payment error:", error);

    res.status(error.statusCode || 400).json({
      success: false,
      message: error.message || "Failed to record payment",
    });
  }
};

exports.cancelPaymentLink = async (req, res) => {
  // Declared outside the try so the catch can name the payment in its log.
  const { paymentId } = req.body || {};

  try {
    if (!paymentId) {
      return res.status(400).json({ success: false, message: "paymentId is required" });
    }

    const payment = await Payment.findByPk(paymentId, {
      attributes: ["id", "created_by", "lead_course_id"],
      raw: true,
    });
    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    // Previously any authenticated user could cancel any link in the org.
    await assertCanCancelPayment(req.user, payment);

    const result = await paymentService.cancelPaymentLink(paymentId);

    res.json({
      success: true,
      reconciled: !!result.reconciled,
      message: result.message || "Payment link cancelled successfully",
    });
  } catch (error) {
    const status = error.statusCode || 400;

    // Always logged, never conditionally. Gateway refusals arrive as 400s, so
    // the old `status >= 500` guard meant the one class of failure operators
    // actually hit left no trace anywhere — and Razorpay's SDK rejects with a
    // bare object whose `message` is undefined, which JSON.stringify then drops
    // from the body. The result was a blank error with no server-side record.
    console.error(
      `Cancel payment link error (payment ${paymentId || "?"}):`,
      error.code ? `[${error.code}]` : "",
      error.message || error,
    );

    res.status(status).json({
      success: false,
      message: error.message || "Failed to cancel the payment link",
    });
  }
};