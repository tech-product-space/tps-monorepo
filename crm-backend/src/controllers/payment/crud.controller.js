const { Payment, PaymentLink, PaymentAttachment, LeadCourse, User } = require("../../models");
const {
  PAYMENT_STATUS,
  VERIFICATION_STATUS,
} = require("../../config/constants/payment");
const { Sequelize } = require("sequelize");
const {
  assertProfileInScope,
  assertLeadCourseInScope,
  assertPaymentInScope,
} = require("../../utils/documentScope");

/**
 * Scope guards throw with a statusCode; anything else is a genuine failure.
 * Without this a 403 would be reported to the client as a 500.
 */
function sendError(res, error, fallback) {
  const status = error.statusCode || 500;
  if (status >= 500) console.error(`${fallback}:`, error);
  return res.status(status).json({
    success: false,
    message: status >= 500 ? fallback : error.message,
  });
}

// Shared include + normalization so profile-scoped and course-scoped payment
// listings return the same provider-agnostic `paymentLink` shape.
const PAYMENT_LINK_INCLUDES = [
  {
    model: PaymentLink,
    as: "Link",
    attributes: ["provider", "url", "status", "provider_link_id", "expire_by", "provider_ref"],
  },
  {
    model: LeadCourse,
    as: "LeadCourse",
    attributes: ["id", "program_name", "course_id"],
    required: false,
  },
  {
    model: User,
    as: "Creator",
    attributes: ["id", "name"],
    required: false,
  },
  {
    model: User,
    as: "Verifier",
    attributes: ["id", "name"],
    required: false,
  },
  {
    // Metadata only — the file bytes live in S3 and are read through a
    // short-lived presigned URL fetched on demand.
    model: PaymentAttachment,
    as: "Attachments",
    attributes: ["id", "file_name", "mime_type", "size_bytes"],
    required: false,
  },
];

// Columns every payment listing exposes. Keep the verification fields here —
// without them the UI cannot tell "awaiting approval" from a live gateway link.
const PAYMENT_LIST_ATTRIBUTES = [
  "id",
  "amount",
  "currency",
  "base_amount",
  "description",
  "source",
  "reference",
  "note",
  "status",
  "verification_status",
  "verified_at",
  "rejection_reason",
  "supersedes_payment_id",
  "created_at",
  "paid_at",
  "lead_course_id",
  "created_by",
];

function normalizePayments(payments) {
  return payments.map((p) => {
    const row = p.toJSON();
    const link = row.Link;
    const paymentLink = link?.url
      ? {
          provider: link.provider,
          short_url: link.url,
          status: link.status,
          expire_by: link.expire_by,
          provider_ref: link.provider_ref || null,
        }
      : null;

    return {
      ...row,
      paymentLink,
      creator: row.Creator || null,
      verified_by_name: row.Verifier?.name || null,
      attachments: row.Attachments || [],
    };
  });
}

exports.getProfilePaymentOverview = async (req, res) => {
  try {
    const { profileId } = req.params;

    await assertProfileInScope(req.user, profileId);

    /**
     * Overview metrics
     */
    const overview = await Payment.findOne({
      attributes: [
        [
          // Sum the INR settlement (base_amount) so mixed-currency totals stay
          // coherent; fall back to amount for any pre-migration null.
          Sequelize.fn(
            "SUM",
            Sequelize.literal(
              `CASE WHEN status = '${PAYMENT_STATUS.PAID}' THEN COALESCE(base_amount, amount) ELSE 0 END`,
            ),
          ),
          "total_collected",
        ],
        [
          // Gateway links only. Manually-recorded payments awaiting approval
          // are also status='pending', so they are excluded by the NULL check —
          // they are money in the queue, not a link the customer hasn't paid.
          Sequelize.fn(
            "COUNT",
            Sequelize.literal(
              `CASE WHEN status = '${PAYMENT_STATUS.PENDING}' AND verification_status IS NULL THEN 1 END`,
            ),
          ),
          "pending_links",
        ],
        [
          Sequelize.fn(
            "COUNT",
            Sequelize.literal(
              `CASE WHEN verification_status = '${VERIFICATION_STATUS.PENDING}' THEN 1 END`,
            ),
          ),
          "awaiting_verification",
        ],
        [
          Sequelize.fn(
            "SUM",
            Sequelize.literal(
              `CASE WHEN verification_status = '${VERIFICATION_STATUS.PENDING}' THEN COALESCE(base_amount, amount) ELSE 0 END`,
            ),
          ),
          "awaiting_verification_amount",
        ],
      ],
      where: {
        lead_profile_id: profileId,
      },
      raw: true,
    });

    /**
     * Last payment
     */
    const lastPayment = await Payment.findOne({
      where: {
        lead_profile_id: profileId,
        status: PAYMENT_STATUS.PAID,
      },
      attributes: ["amount", "paid_at"],
      order: [["paid_at", "DESC"]],
      raw: true,
    });

    res.json({
      success: true,
      data: {
        totalCollected: Number(overview?.total_collected) || 0,
        pendingLinks: Number(overview?.pending_links) || 0,
        awaitingVerification: Number(overview?.awaiting_verification) || 0,
        awaitingVerificationAmount: Number(overview?.awaiting_verification_amount) || 0,
        lastPayment: lastPayment
          ? {
              amount: lastPayment.amount,
              paidAt: lastPayment.paid_at,
            }
          : null,
      },
    });
  } catch (error) {
    sendError(res, error, "Failed to fetch payment overview");
  }
};

exports.listProfilePayments = async (req, res) => {
  try {
    const { profileId } = req.params;

    await assertProfileInScope(req.user, profileId);

    const payments = await Payment.findAll({
      where: {
        lead_profile_id: profileId,
      },

      attributes: PAYMENT_LIST_ATTRIBUTES,

      include: PAYMENT_LINK_INCLUDES,

      order: [["created_at", "DESC"]],
    });

    res.json({
      success: true,
      data: normalizePayments(payments),
    });
  } catch (error) {
    sendError(res, error, "Failed to fetch payments");
  }
};

/**
 * Minimal status read for a single payment. Exists to be POLLED — the enrollment
 * wizard sits on this while a gateway link is outstanding, so it deliberately
 * returns four scalars and nothing else. Use listCoursePayments when you
 * actually need the payment, its link, its proof and its creator.
 *
 * `linkStatus` is what distinguishes "not paid yet" from "will never be paid":
 * an expired or cancelled link is a terminal state the poller must stop on.
 */
exports.getPaymentStatus = async (req, res) => {
  try {
    const { paymentId } = req.params;

    // Same guard the receipt route uses: resolves the payment's enrollment and
    // defers to the enrollment's scope, so an Agent can poll their own
    // collections and nobody else's.
    await assertPaymentInScope(req.user, paymentId);

    const payment = await Payment.findByPk(paymentId, {
      attributes: ["id", "amount", "currency", "status", "verification_status", "paid_at"],
      include: [{ model: PaymentLink, as: "Link", attributes: ["status"] }],
    });
    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    res.json({
      success: true,
      data: {
        id: payment.id,
        amount: Number(payment.amount || 0),
        currency: payment.currency || "INR",
        status: payment.status,
        verification_status: payment.verification_status,
        paid_at: payment.paid_at,
        linkStatus: payment.Link ? payment.Link.status : null,
      },
    });
  } catch (error) {
    sendError(res, error, "Failed to read payment status");
  }
};

exports.listCoursePayments = async (req, res) => {
  try {
    const { leadCourseId } = req.params;

    await assertLeadCourseInScope(req.user, leadCourseId);

    const payments = await Payment.findAll({
      where: {
        lead_course_id: leadCourseId,
      },

      attributes: PAYMENT_LIST_ATTRIBUTES,

      include: PAYMENT_LINK_INCLUDES,

      order: [["created_at", "DESC"]],
    });

    res.json({
      success: true,
      data: normalizePayments(payments),
    });
  } catch (error) {
    sendError(res, error, "Failed to fetch payments");
  }
};
