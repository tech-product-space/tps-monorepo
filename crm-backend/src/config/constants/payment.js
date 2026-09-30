const PAYMENT_STATUS = Object.freeze({
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
});

const RAZORPAY_PAYMENT_LINK_STATUS = Object.freeze({
  CREATED: "created",
  PAID: "paid",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
});

// Cashfree payment-link statuses (normalized to lowercase). Cashfree returns
// these uppercase (ACTIVE/PAID/PARTIALLY_PAID/EXPIRED/CANCELLED); we lowercase
// them before persisting so the column stays consistent with Razorpay's.
const CASHFREE_PAYMENT_LINK_STATUS = Object.freeze({
  ACTIVE: "active",
  PAID: "paid",
  PARTIALLY_PAID: "partially_paid",
  CANCELLED: "cancelled",
  EXPIRED: "expired",
});

// Source of a manually-recorded payment.
const PAYMENT_SOURCE = Object.freeze({
  BANK_TRANSFER: "bank_transfer",
  RAZORPAY: "razorpay",
  CASHFREE: "cashfree",
});

const PAYMENT_SOURCES = Object.freeze(Object.values(PAYMENT_SOURCE));

// Which ledger a payment belongs to.
//
//   course_fee   -> the programme fee the student enrolled at (lead_courses.final_fee)
//   deferral_fee -> a rescheduling fee charged to move batch (lead_courses.deferral_fee_total)
//
// The two are tracked separately, never summed into one price. Three readers
// depend on telling them apart:
//   1. validatePaymentTarget caps a payment within its own ledger
//   2. per-agent revenue excludes deferral fees — a rescheduling fee is not a
//      sale, same treatment as re-enrollments (design decision #9)
//   3. the first-paid-payment trigger ignores them, so an admin fee cannot
//      register a conversion or fire the course onboarding email
const PAYMENT_PURPOSE = Object.freeze({
  COURSE_FEE: "course_fee",
  DEFERRAL_FEE: "deferral_fee",
});

const PAYMENT_PURPOSES = Object.freeze(Object.values(PAYMENT_PURPOSE));

// Approval state of a MANUALLY-recorded payment. Read alongside PAYMENT_STATUS:
//
//   null      -> gateway payment (or a pre-feature row); status stands alone
//   pending   -> awaiting approval   (status = 'pending')
//   verified  -> approved            (status = 'paid')
//   rejected  -> rejected by a verifier      (status = 'cancelled')
//   cancelled -> withdrawn by its recorder   (status = 'cancelled')
//
// `cancelled` is deliberately NOT folded into `rejected`. Both are dead money
// and both are status='cancelled', but they answer different questions: a
// rejection is a verifier's judgement that needs a reason and a re-record, a
// cancellation is the recorder taking back their own entry before anyone judged
// it. Conflating them would put "I keyed in the wrong amount" in the same
// bucket as "the Admin says this money never arrived".
//
// Unverified money is deliberately never status='paid', so every existing
// revenue/dues/receipt query excludes it without needing a new filter.
const VERIFICATION_STATUS = Object.freeze({
  PENDING: "pending",
  VERIFIED: "verified",
  REJECTED: "rejected",
  CANCELLED: "cancelled",
});

// Proof-of-payment upload constraints. Matched to the screenshot/document use
// case rather than the generic upload ceiling.
const PROOF_MAX_FILES = 5;
const PROOF_MAX_BYTES = 10 * 1024 * 1024;
const PROOF_ALLOWED_MIME = Object.freeze([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

module.exports = {
  PAYMENT_STATUS,
  RAZORPAY_PAYMENT_LINK_STATUS,
  CASHFREE_PAYMENT_LINK_STATUS,
  PAYMENT_SOURCE,
  PAYMENT_SOURCES,
  PAYMENT_PURPOSE,
  PAYMENT_PURPOSES,
  VERIFICATION_STATUS,
  PROOF_MAX_FILES,
  PROOF_MAX_BYTES,
  PROOF_ALLOWED_MIME,
};