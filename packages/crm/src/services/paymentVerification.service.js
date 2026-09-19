const { Op } = require("sequelize");
const {
  Payment,
  PaymentAttachment,
  LeadProfile,
  LeadCourse,
  User,
  Activity,
} = require("../models");
const {
  PAYMENT_STATUS,
  VERIFICATION_STATUS,
} = require("../config/constants/payment");
const { ENROLLMENT_STATUS } = require("../config/constants/enrollment");
const { formatMoney } = require("../config/constants/currency");
const { getScopedUserIds } = require("../utils/dashboardScope");
const { parsePagination, buildPage } = require("../utils/pagination");
const proofStorage = require("./paymentProof.storage");
const notifier = require("./paymentVerificationNotifier.service");
const {
  maybeAutoSendOnboarding,
  getOnboardingEligibilityMap,
} = require("./emailTemplate.service");

/**
 * Approval workflow for manually-recorded payments.
 *
 * A pending payment is status='pending' + verification_status='pending', which
 * keeps it out of every revenue/dues/receipt query for free. Approval is the
 * only thing that promotes it to status='paid'.
 */

function conflict(message, code) {
  return Object.assign(new Error(message), { statusCode: 409, code });
}

/**
 * Three actions race for the same row: a verifier approving, a verifier
 * rejecting, and the recorder cancelling. All three resolve identically —
 * whoever's UPDATE lands on the still-pending row first wins, and the losers
 * are told what happened rather than silently no-op'd.
 *
 * The message names the winning outcome on purpose. "Someone else actioned it"
 * leaves the loser guessing whether the money ended up counting, which is the
 * one thing both an agent and a verifier need to know before they act again.
 */
function actionedConflict(verificationStatus) {
  switch (verificationStatus) {
    case VERIFICATION_STATUS.VERIFIED:
      return conflict(
        "This payment was verified first — it already counts towards collections. Ask an Admin to reverse it if that was wrong.",
        "ALREADY_VERIFIED",
      );
    case VERIFICATION_STATUS.REJECTED:
      return conflict(
        "This payment was rejected first. Record a corrected payment instead of actioning this one.",
        "ALREADY_REJECTED",
      );
    case VERIFICATION_STATUS.CANCELLED:
      return conflict(
        "The person who recorded this payment cancelled it first — there is nothing left to action.",
        "ALREADY_CANCELLED",
      );
    default:
      return conflict(
        "This payment is no longer awaiting verification — someone may have just actioned it.",
        "ALREADY_ACTIONED",
      );
  }
}

/**
 * Build the conflict for a guarded UPDATE that matched no rows. Re-reads the
 * row, because losing the race is exactly the case where the copy loaded before
 * the UPDATE is stale.
 */
async function conflictAfterLostRace(paymentId) {
  const fresh = await Payment.findByPk(paymentId, {
    attributes: ["id", "verification_status"],
    raw: true,
  });
  return actionedConflict(fresh?.verification_status);
}

/** belongsTo-only includes: safe to combine with limit/offset in one query. */
const QUEUE_INCLUDES = [
  {
    model: User,
    as: "Creator",
    attributes: ["id", "name", "email"],
    required: false,
  },
  {
    model: LeadProfile,
    as: "LeadProfile",
    attributes: ["id", "name", "phone", "email"],
    required: false,
  },
  {
    model: LeadCourse,
    as: "LeadCourse",
    // `status` drives the dropped banner in VerifyPaymentModal. The queue keeps
    // showing these rows: money awaiting approval must still be resolved even
    // if the enrollment ended, and a drop is refused while any is pending — so
    // this can only be reached by a webhook landing after the fact.
    attributes: ["id", "program_name", "course_id", "final_fee", "currency", "status"],
    required: false,
  },
];

const QUEUE_ATTRIBUTES = [
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
  "paid_at",
  "created_at",
  "created_by",
  "lead_profile_id",
  "lead_course_id",
  "supersedes_payment_id",
  // Which ledger the money settles. Read by the onboarding trigger after
  // approval (a deferral fee must not welcome the student to the programme),
  // and surfaced in the queue so a verifier can see what they are approving.
  "purpose",
  "cohort_name",
];

/**
 * Build the `where` for the queue, applying role scope.
 *
 * Superadmin / Program Manager see everything. A Manager sees only what their
 * own team recorded — read-only visibility so they can chase their collections.
 * Any other role resolves to its own id, which is harmless: the route already
 * refuses them.
 */
async function buildQueueWhere(user, filters = {}) {
  const where = { verification_status: VERIFICATION_STATUS.PENDING };

  const scopedUserIds = await getScopedUserIds(user);
  if (scopedUserIds !== null) {
    where.created_by = { [Op.in]: scopedUserIds };
  }

  const agentIds = (filters.agentIds || []).filter(Boolean).map((id) => String(id).toLowerCase());
  if (agentIds.length) {
    // Intersect with the role scope rather than replacing it.
    where.created_by = scopedUserIds
      ? { [Op.in]: agentIds.filter((id) => scopedUserIds.includes(id)) }
      : { [Op.in]: agentIds };
  }

  if (filters.source) where.source = filters.source;
  if (filters.leadCourseId) where.lead_course_id = filters.leadCourseId;

  if (filters.from || filters.to) {
    where.created_at = {};
    if (filters.from) where.created_at[Op.gte] = new Date(filters.from);
    if (filters.to) {
      const to = new Date(filters.to);
      to.setHours(23, 59, 59, 999);
      where.created_at[Op.lte] = to;
    }
  }

  const min = Number(filters.minAmount);
  const max = Number(filters.maxAmount);
  if (Number.isFinite(min) || Number.isFinite(max)) {
    where.amount = {};
    if (Number.isFinite(min)) where.amount[Op.gte] = min;
    if (Number.isFinite(max)) where.amount[Op.lte] = max;
  }

  const q = (filters.q || "").trim();
  if (q) {
    where[Op.or] = [
      { reference: { [Op.iLike]: `%${q}%` } },
      { description: { [Op.iLike]: `%${q}%` } },
      { "$LeadProfile.name$": { [Op.iLike]: `%${q}%` } },
      { "$LeadProfile.phone$": { [Op.iLike]: `%${q}%` } },
    ];
  }

  return where;
}

/**
 * Load attachments for a page of payments and presign each one.
 *
 * Signing is local HMAC — no network round-trip — so doing it for a whole page
 * is free, and it lets the client render <img src> without a second request.
 */
async function attachProofs(rows) {
  if (!rows.length) return rows;

  const attachments = await PaymentAttachment.findAll({
    where: { payment_id: { [Op.in]: rows.map((r) => r.id) } },
    attributes: ["id", "payment_id", "file_key", "file_name", "mime_type", "size_bytes"],
    order: [["created_at", "ASC"]],
    raw: true,
  });

  const byPayment = new Map();
  await Promise.all(
    attachments.map(async (a) => {
      let previewUrl = null;
      try {
        previewUrl = await proofStorage.signedUrl({
          key: a.file_key,
          fileName: a.file_name,
          mimeType: a.mime_type,
        });
      } catch (err) {
        // A broken object must not take down the whole queue.
        console.error("Failed to sign payment proof", a.id, err.message);
      }

      const list = byPayment.get(a.payment_id) || [];
      list.push({
        id: a.id,
        file_name: a.file_name,
        mime_type: a.mime_type,
        size_bytes: a.size_bytes,
        preview_url: previewUrl,
      });
      byPayment.set(a.payment_id, list);
    }),
  );

  return rows.map((row) => ({ ...row, attachments: byPayment.get(row.id) || [] }));
}

/**
 * One page of payments awaiting verification, oldest first — the ones most
 * likely to have been forgotten surface at the top.
 */
async function listPendingVerifications({ user, filters = {}, query = {} }) {
  const { page, limit, offset } = parsePagination(query);
  const where = await buildQueueWhere(user, filters);

  const { rows, count } = await Payment.findAndCountAll({
    where,
    attributes: QUEUE_ATTRIBUTES,
    include: QUEUE_INCLUDES,
    order: [["created_at", "ASC"]],
    limit,
    offset,
    // All includes are belongsTo (1:1), so a flat JOIN keeps limit/offset
    // accurate and lets the $LeadProfile.name$ search reference the join.
    subQuery: false,
  });

  const plain = rows.map((r) => {
    const row = r.toJSON();
    return {
      ...row,
      creator: row.Creator || null,
      profile: row.LeadProfile || null,
      course: row.LeadCourse || null,
    };
  });

  // Approving one of these also mails the customer, whenever it would be the
  // enrollment's first payment. The verifier has to be told that BEFORE they
  // click, so the flag rides along with the row.
  const eligibility = await getOnboardingEligibilityMap(
    plain.map((r) => ({
      leadCourseId: r.lead_course_id,
      courseId: r.course?.course_id,
      email: r.profile?.email,
    })),
  );

  const flagged = plain.map((r) => ({
    ...r,
    willSendOnboarding: Boolean(
      r.lead_course_id && eligibility[String(r.lead_course_id)],
    ),
  }));

  const withProofs = await attachProofs(flagged);

  return buildPage({ rows: withProofs, count, page, limit });
}

/**
 * Count + total value awaiting verification, for the nav badge and the queue's
 * summary strip. Same scoping as the list.
 */
async function getPendingVerificationSummary({ user, filters = {} }) {
  const where = await buildQueueWhere(user, filters);

  const rows = await Payment.findAll({
    where,
    include: QUEUE_INCLUDES.filter((i) => i.as === "LeadProfile"),
    attributes: ["id", "amount", "currency"],
    subQuery: false,
  });

  const byCurrency = rows.reduce((acc, r) => {
    const cur = r.currency || "INR";
    acc[cur] = (acc[cur] || 0) + Number(r.amount || 0);
    return acc;
  }, {});

  return {
    count: rows.length,
    totalsByCurrency: byCurrency,
  };
}

/** Shared loader for verify/reject: the payment plus enough context to act. */
async function loadForDecision(paymentId) {
  const payment = await Payment.findByPk(paymentId, {
    include: [
      {
        model: LeadCourse,
        as: "LeadCourse",
        // `status` is required by the dropped-enrollment guard in verifyPayment
        // — without it here the guard reads undefined and silently never fires.
        attributes: ["id", "program_name", "final_fee", "currency", "status"],
        required: false,
        include: [
          {
            model: Payment,
            as: "Payments",
            attributes: ["id", "amount", "status", "verification_status"],
          },
        ],
      },
    ],
  });

  if (!payment) {
    throw Object.assign(new Error("Payment not found"), { statusCode: 404 });
  }

  if (payment.verification_status !== VERIFICATION_STATUS.PENDING) {
    throw actionedConflict(payment.verification_status);
  }

  return payment;
}

/**
 * Approve a payment: it becomes status='paid' and starts counting as money.
 *
 * `paid_at` is deliberately left untouched, so revenue is attributed to the day
 * the money was received rather than the day it was approved.
 */
async function verifyPayment({ paymentId, verifierId, allowOverCollection = false }) {
  const payment = await loadForDecision(paymentId);
  const course = payment.LeadCourse;

  // Belt-and-braces against a drop/verify race. dropEnrollment refuses while
  // anything is awaiting verification, so this should be unreachable — but the
  // two actions can interleave, and approving money onto a dead enrollment is
  // exactly the outcome that check exists to prevent. Reject rather than verify:
  // a rejected payment is recoverable, a mis-attributed one is not.
  if (course && course.status === ENROLLMENT_STATUS.DROPPED) {
    throw conflict(
      "This enrollment was dropped while the payment was awaiting verification. Reject the payment, or reinstate the enrollment first.",
      "ENROLLMENT_DROPPED",
    );
  }

  // The due can have moved since this was recorded — a gateway payment may have
  // landed in the meantime. Re-check rather than trusting the record-time guard.
  if (course) {
    const committed = (course.Payments || [])
      .filter((p) => String(p.id) !== String(payment.id))
      .filter((p) => p.status === PAYMENT_STATUS.PAID || p.status === PAYMENT_STATUS.PENDING)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const remainingDue = Math.max(0, Number(course.final_fee) - committed);
    const amount = Number(payment.amount);

    if (amount > remainingDue && !allowOverCollection) {
      throw Object.assign(
        new Error(
          `Verifying this would collect ${formatMoney(amount - remainingDue, payment.currency)} more than the remaining due.`,
        ),
        {
          statusCode: 409,
          code: "OVER_COLLECTION",
          details: {
            amount,
            remainingDue,
            overBy: amount - remainingDue,
            currency: payment.currency,
          },
        },
      );
    }
  }

  // Guarded update: two verifiers clicking at once — or a verifier racing the
  // recorder's cancel — means one wins and the others get a clean conflict,
  // never a double-apply. Same shape as the webhook path.
  //
  // This is also what makes approval safe to build side effects on: everything
  // below (the activity entry, the push, the onboarding mail) runs only for the
  // caller whose UPDATE actually moved the row, so a cancelled payment can
  // never mail the customer.
  const [affected] = await Payment.update(
    {
      status: PAYMENT_STATUS.PAID,
      verification_status: VERIFICATION_STATUS.VERIFIED,
      verified_by: verifierId,
      verified_at: new Date(),
    },
    {
      where: {
        id: paymentId,
        verification_status: VERIFICATION_STATUS.PENDING,
      },
    },
  );

  if (!affected) {
    throw await conflictAfterLostRace(paymentId);
  }

  const selfApproved = String(payment.created_by).toLowerCase() === String(verifierId).toLowerCase();
  const money = formatMoney(Number(payment.amount), payment.currency);

  await Activity.create({
    lead_id: null,
    profile_id: payment.lead_profile_id,
    actor_id: verifierId,
    type: "Payment",
    title: `Payment verified${selfApproved ? " (self-approved)" : ""} — ${money}`,
    details: `Verified a manually-recorded payment of ${money}.${
      course ? ` Course: ${course.program_name}.` : ""
    }${selfApproved ? " Approved by the same user who recorded it." : ""}`,
    metadata: {
      action: "payment_verified",
      payment_id: payment.id,
      amount: Number(payment.amount),
      currency: payment.currency,
      lead_course_id: payment.lead_course_id,
      self_approved: selfApproved,
      over_collection_allowed: Boolean(allowOverCollection),
    },
  });

  notifier.notifyVerified({
    payment,
    verifierId,
    money,
    programName: course ? course.program_name : null,
  });

  // Approval is the moment a hand-recorded payment becomes real money, so it is
  // also the moment the customer may be onboarded. Fires only if this is the
  // enrollment's first paid payment; skips silently otherwise. Fire-and-forget,
  // like the notifier above — the verifier's click must not hang on an SMTP
  // round-trip, and a mail failure must not un-verify a payment.
  maybeAutoSendOnboarding({
    leadCourseId: payment.lead_course_id,
    paymentId: payment.id,
    // A verified deferral fee is real money but not a course payment, so it
    // must not welcome the student to the programme.
    purpose: payment.purpose,
  }).catch((err) =>
    console.error("[PaymentVerification] Auto onboarding send failed:", err.message),
  );

  return Payment.findByPk(paymentId, { attributes: QUEUE_ATTRIBUTES.concat(["verified_by", "verified_at"]) });
}

/**
 * Reject a payment. It becomes status='cancelled' — not 'failed', which means a
 * gateway declined the charge — so it drops out of every aggregate and frees
 * the due it was reserving. Attachments are kept: they are the evidence for why.
 */
async function rejectPayment({ paymentId, verifierId, reason }) {
  const trimmed = (reason || "").trim();
  if (trimmed.length < 5) {
    throw Object.assign(
      new Error("Give a reason of at least 5 characters so the recorder knows what to fix."),
      { statusCode: 400 },
    );
  }
  if (trimmed.length > 500) {
    throw Object.assign(new Error("Reason must be 500 characters or fewer."), {
      statusCode: 400,
    });
  }

  const payment = await loadForDecision(paymentId);
  const course = payment.LeadCourse;

  const [affected] = await Payment.update(
    {
      status: PAYMENT_STATUS.CANCELLED,
      verification_status: VERIFICATION_STATUS.REJECTED,
      rejection_reason: trimmed,
      verified_by: verifierId,
      verified_at: new Date(),
    },
    {
      where: {
        id: paymentId,
        verification_status: VERIFICATION_STATUS.PENDING,
      },
    },
  );

  if (!affected) {
    throw await conflictAfterLostRace(paymentId);
  }

  const money = formatMoney(Number(payment.amount), payment.currency);

  await Activity.create({
    lead_id: null,
    profile_id: payment.lead_profile_id,
    actor_id: verifierId,
    type: "Payment",
    title: `Payment rejected — ${money}`,
    details: `Rejected a manually-recorded payment of ${money}. Reason: ${trimmed}${
      course ? ` Course: ${course.program_name}.` : ""
    }`,
    metadata: {
      action: "payment_rejected",
      payment_id: payment.id,
      amount: Number(payment.amount),
      currency: payment.currency,
      lead_course_id: payment.lead_course_id,
      rejection_reason: trimmed,
    },
  });

  notifier.notifyRejected({ payment, verifierId, money, reason: trimmed });

  return Payment.findByPk(paymentId, {
    attributes: QUEUE_ATTRIBUTES.concat(["verified_by", "verified_at", "rejection_reason"]),
  });
}

/**
 * Withdraw a manually-recorded payment, on the recorder's own initiative.
 *
 * The window is deliberately narrow: only while the payment is still awaiting
 * verification. Once a verifier has acted the outcome is theirs, and the way
 * back is a corrected re-record, not a quiet retraction of money that has
 * already been counted.
 *
 * The row is kept rather than deleted — a claim that was made and taken back is
 * part of the audit trail, and the proof files attached to it are evidence
 * either way. It lands on status='cancelled', the same dead-money state a
 * rejection uses, so it drops out of every revenue/dues figure and releases the
 * due it was holding without a single aggregate needing to learn a new state.
 */
async function cancelPayment({ paymentId, actorId, reason }) {
  const trimmed = (reason || "").trim();
  // No minimum, unlike a rejection. A rejection has to explain itself to
  // someone else; cancelling your own entry usually means you already know
  // what went wrong, and forcing a sentence out of the person who is fixing
  // their own typo just gets "mistake" typed five times a day.
  if (trimmed.length > 500) {
    throw Object.assign(new Error("Reason must be 500 characters or fewer."), {
      statusCode: 400,
    });
  }

  const payment = await loadForDecision(paymentId);
  const course = payment.LeadCourse;

  // Ownership, not role. Cancelling is taking back your OWN entry; a verifier
  // killing someone else's payment goes through reject, which forces a reason
  // and tells the recorder why. Without this check "cancel" would be an
  // unexplained reject that any signed-in user could fire on anyone's money.
  if (String(payment.created_by).toLowerCase() !== String(actorId).toLowerCase()) {
    throw Object.assign(
      new Error(
        "You can only cancel a payment you recorded yourself. Ask an Admin to reject it instead.",
      ),
      { statusCode: 403, code: "NOT_RECORDER" },
    );
  }

  // Same guarded update as verify/reject, and the same rule: first write wins.
  // If a verifier approved a moment ago this matches nothing, and the recorder
  // is told the money already counts rather than quietly un-counting it.
  const [affected] = await Payment.update(
    {
      status: PAYMENT_STATUS.CANCELLED,
      verification_status: VERIFICATION_STATUS.CANCELLED,
      // Reusing the rejection column: it is the "why is this row dead" note,
      // and verification_status already says who killed it. Nullable here
      // because a self-cancel needs no justification.
      rejection_reason: trimmed || null,
      // verified_by/_at are "who actioned this, and when" — the audit trail
      // and the CSV export read them for every terminal state, not just
      // approvals.
      verified_by: actorId,
      verified_at: new Date(),
    },
    {
      where: {
        id: paymentId,
        verification_status: VERIFICATION_STATUS.PENDING,
      },
    },
  );

  if (!affected) {
    throw await conflictAfterLostRace(paymentId);
  }

  const money = formatMoney(Number(payment.amount), payment.currency);

  await Activity.create({
    lead_id: null,
    profile_id: payment.lead_profile_id,
    actor_id: actorId,
    type: "Payment",
    title: `Payment cancelled by recorder — ${money}`,
    details: `Withdrew a manually-recorded payment of ${money} before it was verified.${
      course ? ` Course: ${course.program_name}.` : ""
    }${trimmed ? ` Reason: ${trimmed}` : ""}`,
    metadata: {
      action: "payment_cancelled",
      payment_id: payment.id,
      amount: Number(payment.amount),
      currency: payment.currency,
      lead_course_id: payment.lead_course_id,
      cancellation_reason: trimmed || null,
    },
  });

  // Verifiers watching the queue see the row disappear; tell them why, so a
  // half-reviewed payment vanishing off their screen isn't a mystery.
  notifier.notifyCancelled({
    payment,
    actorId,
    money,
    programName: course ? course.program_name : null,
    reason: trimmed,
  });

  return Payment.findByPk(paymentId, {
    attributes: QUEUE_ATTRIBUTES.concat(["verified_by", "verified_at", "rejection_reason"]),
  });
}

/**
 * Presign a single attachment for viewing. The CALLER must have already
 * authorized the viewer against the parent payment.
 */
async function getAttachmentUrl({ paymentId, attachmentId, download = false }) {
  const attachment = await PaymentAttachment.findOne({
    where: { id: attachmentId, payment_id: paymentId },
    attributes: ["id", "file_key", "file_name", "mime_type", "size_bytes"],
    raw: true,
  });

  if (!attachment) {
    throw Object.assign(new Error("Attachment not found"), { statusCode: 404 });
  }

  const url = await proofStorage.signedUrl({
    key: attachment.file_key,
    fileName: attachment.file_name,
    mimeType: attachment.mime_type,
    disposition: download ? "attachment" : "inline",
  });

  return {
    url,
    expiresIn: proofStorage.SIGNED_URL_TTL_SECONDS,
    file_name: attachment.file_name,
    mime_type: attachment.mime_type,
    size_bytes: attachment.size_bytes,
  };
}

module.exports = {
  listPendingVerifications,
  getPendingVerificationSummary,
  verifyPayment,
  rejectPayment,
  cancelPayment,
  getAttachmentUrl,
};
