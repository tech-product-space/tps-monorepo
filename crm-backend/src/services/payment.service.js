const { randomUUID } = require("crypto");
const { ENROLLMENT_STATUS } = require("../config/constants/enrollment");
const {
  PAYMENT_STATUS,
  PAYMENT_SOURCE,
  PAYMENT_SOURCES,
  PAYMENT_PURPOSE,
  PAYMENT_PURPOSES,
  VERIFICATION_STATUS,
} = require("../config/constants/payment");
const { fromSubunit, formatMoney } = require("../config/constants/currency");
const { getProvider } = require("../config/payment/providers");
const {
  sequelize,
  Payment,
  PaymentAttachment,
  PaymentLink,
  LeadProfile,
  LeadCourse,
  Activity,
} = require("../models");
const proofStorage = require("./paymentProof.storage");
const verificationNotifier = require("./paymentVerificationNotifier.service");
const { maybeAutoSendOnboarding } = require("./emailTemplate.service");

/**
 * Validate amount and (when tied to an enrolled course) ensure the amount does
 * not exceed the remaining due. Shared by the manual + link-generation flows.
 *
 * Due is computed against paid + pending payments so two concurrent links can't
 * each be sized to the full due (over-collection guard).
 *
 * An enrollment carries TWO independent ledgers and a payment is capped within
 * its own — course fees against final_fee, deferral fees against
 * deferral_fee_total. Merging them would let an unpaid rescheduling fee block a
 * course instalment, and would make the course fee's "fully paid" state depend
 * on an unrelated admin charge. Every pre-existing payment is a course fee (the
 * column default), so this path behaves exactly as it did before.
 *
 * Returns { numericAmount, leadProfile, leadCourse, currency }.
 */
async function validatePaymentTarget({
  leadProfileId,
  amount,
  leadCourseId,
  purpose = PAYMENT_PURPOSE.COURSE_FEE,
}) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("Amount must be a number greater than zero");
  }

  const leadProfile = await LeadProfile.findByPk(leadProfileId);
  if (!leadProfile) {
    throw new Error("Lead profile not found");
  }

  let leadCourse = null;
  if (leadCourseId) {
    leadCourse = await LeadCourse.findByPk(leadCourseId, {
      include: [
        {
          model: Payment,
          as: "Payments",
          attributes: ["amount", "status", "verification_status", "purpose"],
        },
      ],
    });
    if (!leadCourse) {
      throw new Error("Enrolled course not found");
    }
    // A dropped enrollment takes no more money. This single check covers every
    // inbound path — recording a manual payment, generating a gateway link, and
    // (via the same helper) the verification queue — because they all resolve
    // their target here.
    if (leadCourse.status === ENROLLMENT_STATUS.DROPPED) {
      throw Object.assign(
        new Error("This enrollment has been dropped and can no longer accept payments"),
        { statusCode: 409, code: "ENROLLMENT_DROPPED" },
      );
    }
    // Cap and committed total both come from the SAME ledger. Rows written
    // before the purpose column existed read as course_fee, which is what they
    // are.
    const isDeferralFee = purpose === PAYMENT_PURPOSE.DEFERRAL_FEE;
    const ledgerTotal = isDeferralFee
      ? Number(leadCourse.deferral_fee_total || 0)
      : Number(leadCourse.final_fee);

    // Awaiting-verification payments are status='pending', so they are counted
    // here too — an unapproved entry reserves the due, which stops two agents
    // from each recording the full amount while the first is still in the queue.
    const committed = (leadCourse.Payments || [])
      .filter(
        (p) => (p.purpose || PAYMENT_PURPOSE.COURSE_FEE) === purpose,
      )
      .filter((p) => p.status === PAYMENT_STATUS.PAID || p.status === PAYMENT_STATUS.PENDING)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const due = Math.max(0, ledgerTotal - committed);
    if (numericAmount > due) {
      throw new Error(
        isDeferralFee
          ? `Amount (${numericAmount}) cannot exceed the outstanding deferral fee (${due})`
          : `Amount (${numericAmount}) cannot exceed the remaining due (${due})`,
      );
    }
  }

  const currency = leadCourse ? leadCourse.currency : "INR";
  return { numericAmount, leadProfile, leadCourse, currency };
}

/**
 * Record a payment manually, pending verification.
 *
 * Used by the manual collection flow (bank transfer / Razorpay / Cashfree).
 * The row is created as status='pending' + verification_status='pending', NOT
 * as paid — it becomes money only when a Superadmin or Program Manager
 * approves it (see paymentVerification.service#verifyPayment).
 *
 * Everyone goes through the queue, including a Superadmin recording their own
 * collection. They may approve it themselves afterwards, which is logged.
 *
 * `files` are optional proof screenshots (multer memory buffers). Ordering
 * matters: they are validated and pushed to S3 BEFORE the transaction opens, so
 * a slow or failed upload never holds a DB transaction open, and anything
 * already uploaded is deleted if the transaction then fails.
 */
async function recordManualPayment({
  leadProfileId,
  userId,
  amount,
  source,
  reference,
  note,
  description,
  leadCourseId,
  paidAt,
  supersedesPaymentId,
  purpose = PAYMENT_PURPOSE.COURSE_FEE,
  files = [],
}) {
  if (!source || !PAYMENT_SOURCES.includes(source)) {
    throw new Error(`source must be one of: ${PAYMENT_SOURCES.join(", ")}`);
  }
  if (!PAYMENT_PURPOSES.includes(purpose)) {
    throw new Error(`purpose must be one of: ${PAYMENT_PURPOSES.join(", ")}`);
  }

  const { numericAmount, leadCourse, currency } = await validatePaymentTarget({
    leadProfileId,
    amount,
    leadCourseId,
    purpose,
  });

  const paidAtDate = paidAt ? new Date(paidAt) : new Date();
  if (Number.isNaN(paidAtDate.getTime())) {
    throw new Error("Invalid paid date");
  }

  // A correction may only point at a rejected payment on the same profile,
  // otherwise the "supersedes" link could be used to graft unrelated history.
  let supersedes = null;
  if (supersedesPaymentId) {
    supersedes = await Payment.findByPk(supersedesPaymentId, {
      attributes: ["id", "lead_profile_id", "verification_status"],
    });
    if (!supersedes) {
      throw new Error("The payment being corrected was not found");
    }
    if (supersedes.verification_status !== VERIFICATION_STATUS.REJECTED) {
      throw new Error("Only a rejected payment can be corrected");
    }
    if (String(supersedes.lead_profile_id) !== String(leadProfileId)) {
      throw new Error("The payment being corrected belongs to a different lead");
    }
  }

  // Pre-generate the id so proof objects can be keyed by payment before insert.
  const paymentId = randomUUID();

  files.forEach((file) => proofStorage.assertValidProofFile(file));

  const uploaded = [];
  try {
    for (const file of files) {
      uploaded.push(await proofStorage.put(file, paymentId));
    }
  } catch (err) {
    await Promise.all(uploaded.map((u) => proofStorage.remove(u.file_key)));
    console.error("Payment proof upload failed:", err);
    throw new Error("Could not upload the attached proof. Please try again.");
  }

  const sourceLabel = source.replace(/_/g, " ");
  const money = formatMoney(numericAmount, currency);

  let payment;
  try {
    payment = await sequelize.transaction(async (transaction) => {
      const created = await Payment.create(
        {
          id: paymentId,
          lead_profile_id: leadProfileId,
          created_by: userId,
          amount: numericAmount,
          currency,
          // Manual INR payments settle 1:1; foreign manual payments have no
          // gateway FX so base_amount is left null (excluded from INR rollups).
          base_amount: currency === "INR" ? numericAmount : null,
          base_currency: "INR",
          description: description || null,
          source,
          reference: reference || null,
          note: note || null,
          // Deliberately NOT 'paid'. Every revenue/dues/receipt query filters on
          // status='paid', so this keeps unverified money out of all of them
          // without needing a new condition in ~30 places.
          status: PAYMENT_STATUS.PENDING,
          verification_status: VERIFICATION_STATUS.PENDING,
          // The date the money was actually received, preserved through
          // approval so revenue lands in the right period.
          paid_at: paidAtDate,
          lead_course_id: leadCourseId || null,
          // Which batch this money was received under, and which ledger it
          // belongs to. The cohort is snapshotted here so a later deferral
          // cannot move already-collected money into the student's new batch.
          cohort_id: leadCourse ? leadCourse.cohort_id : null,
          cohort_name: leadCourse ? leadCourse.cohort_name : null,
          purpose,
          supersedes_payment_id: supersedes ? supersedes.id : null,
        },
        { transaction },
      );

      if (uploaded.length) {
        await PaymentAttachment.bulkCreate(
          uploaded.map((u) => ({ ...u, payment_id: paymentId, uploaded_by: userId })),
          { transaction },
        );
      }

      await Activity.create(
        {
          lead_id: null,
          profile_id: leadProfileId,
          actor_id: userId,
          type: "Payment",
          title: `Payment recorded — ${money} via ${sourceLabel} (awaiting verification)`,
          details: `Recorded a payment of ${money} via ${sourceLabel}. Awaiting verification.${
            reference ? ` Reference: ${reference}.` : ""
          }${leadCourse ? ` Course: ${leadCourse.program_name}.` : ""}${
            uploaded.length ? ` ${uploaded.length} proof file(s) attached.` : ""
          }`,
          metadata: {
            action: "payment_recorded_pending_verification",
            payment_id: paymentId,
            amount: numericAmount,
            currency,
            source,
            reference: reference || null,
            lead_course_id: leadCourseId || null,
            paid_at: paidAtDate.toISOString(),
            attachment_count: uploaded.length,
            supersedes_payment_id: supersedes ? supersedes.id : null,
          },
        },
        { transaction },
      );

      return created;
    });
  } catch (err) {
    // The payment never landed, so its proof objects are orphans — bin them.
    await Promise.all(uploaded.map((u) => proofStorage.remove(u.file_key)));
    throw err;
  }

  // Best-effort: a push failure must never fail a recorded payment.
  verificationNotifier.notifyRecorded({
    payment,
    recorderId: userId,
    money,
    programName: leadCourse ? leadCourse.program_name : null,
  });

  return payment;
}

/**
 * Generate a hosted payment link via the selected gateway.
 *
 * Gateway-agnostic: resolves the provider from the registry, checks it supports
 * the enrollment currency, creates a pending Payment, asks the provider to
 * create the link, and persists the normalized PaymentLink. The Payment flips
 * to paid only via the webhook (applyPaymentEvent).
 */
async function generatePaymentLink({
  leadProfileId,
  userId,
  amount,
  description,
  expiry,
  offerId,
  leadCourseId,
  source,
  purpose = PAYMENT_PURPOSE.COURSE_FEE,
}) {
  const providerKey = source || PAYMENT_SOURCE.RAZORPAY;
  const provider = getProvider(providerKey);
  if (!provider) {
    throw new Error("Unknown payment provider");
  }
  if (!PAYMENT_PURPOSES.includes(purpose)) {
    throw new Error(`purpose must be one of: ${PAYMENT_PURPOSES.join(", ")}`);
  }

  const { numericAmount, leadProfile, leadCourse, currency } = await validatePaymentTarget({
    leadProfileId,
    amount,
    leadCourseId,
    purpose,
  });

  if (!provider.supportsCurrency(currency)) {
    throw new Error(`${provider.label} doesn't support ${currency}`);
  }

  const payment = await Payment.create({
    lead_profile_id: leadProfileId,
    created_by: userId,
    amount: numericAmount,
    currency,
    description,
    source: providerKey,
    expire_by: expiry || null,
    lead_course_id: leadCourseId || null,
    // Snapshotted at creation like the manual path. A link left open across a
    // deferral is re-stamped to the new cohort by changeEnrollmentCohort, since
    // money that has not arrived yet belongs to the batch the student is in
    // when it does.
    cohort_id: leadCourse ? leadCourse.cohort_id : null,
    cohort_name: leadCourse ? leadCourse.cohort_name : null,
    purpose,
  });

  let link;
  try {
    link = await provider.createLink({
      payment,
      leadProfile,
      amount: numericAmount,
      currency,
      description,
      expiry,
      offerId,
    });
  } catch (err) {
    // Don't leave an orphan pending payment if the gateway call fails.
    await payment.destroy();
    throw err;
  }

  await PaymentLink.create({
    payment_id: payment.id,
    provider: providerKey,
    provider_link_id: link.providerLinkId,
    url: link.shortUrl,
    status: link.status,
    expire_by: link.expireBy || null,
    raw: link.raw || null,
  });

  const money = formatMoney(numericAmount, currency);
  await Activity.create({
    lead_id: null,
    profile_id: leadProfileId,
    actor_id: userId,
    type: "Payment",
    title: `Payment link generated — ${money}`,
    details: `Generated ${provider.label} payment link of ${money} for ${description}.${
      leadCourseId ? " Linked to enrolled course." : ""
    }`,
    metadata: {
      action: "payment_link_generated",
      provider: providerKey,
      payment_id: payment.id,
      amount: numericAmount,
      currency,
      description,
      lead_course_id: leadCourseId || null,
      short_url: link.shortUrl,
    },
  });

  // payment_id is additive — callers that only want the URL are unaffected. The
  // enrollment wizard needs it to poll GET /payment/:id/status while it waits.
  return { short_url: link.shortUrl, payment_id: payment.id };
}

// Gateway link states in which the link can no longer take money. Reaching one
// of these is what makes a cancel impossible — and also makes it unnecessary.
const DEAD_LINK_STATUSES = new Set(["expired", "cancelled", "canceled"]);

// Gateway link states that mean money has already moved. Never rewritten from a
// failed cancel: see reconcileDeadLink.
const SETTLED_LINK_STATUSES = new Set(["paid", "partially_paid"]);

/**
 * The gateway refused to cancel because the link is no longer live. Work out
 * what actually became of it and bring our copy into line.
 *
 * This exists because nothing else reconciles a link: our `pending` is only
 * ever moved by an inbound webhook, so a missed, unsubscribed or (for
 * Cashfree's silent 30-day default expiry) never-sent event strands the row on
 * `pending` forever — showing a Cancel button that can only ever fail, and
 * claiming a dead URL can still be paid.
 *
 * Deliberately conservative about money. If the gateway says the link was PAID,
 * we do NOT mark it paid here: the amount, settlement currency, fees and
 * paid-at all come from the webhook payload, and manufacturing a paid record
 * from a cancel button would invent revenue, credit an agent and fire the
 * onboarding email off data we don't have. That case is surfaced loudly instead
 * — a missed paid webhook needs replaying, not papering over. Likewise, if we
 * can't reach the gateway to confirm, we re-throw rather than guess.
 */
async function reconcileDeadLink({ payment, link, provider, gatewayError }) {
  if (typeof provider.fetchLink !== "function") throw gatewayError;

  let remoteStatus;
  try {
    ({ status: remoteStatus } = await provider.fetchLink(link.provider_link_id));
  } catch (err) {
    console.error(
      `[Payment] ${provider.label} link lookup failed while reconciling payment ${payment.id}:`,
      err.message,
    );
    throw gatewayError; // Unconfirmed — report the gateway's own words.
  }

  if (SETTLED_LINK_STATUSES.has(remoteStatus)) {
    console.error(
      `[Payment] ${provider.label} reports link for payment ${payment.id} as ${remoteStatus}, ` +
        `but it is still pending here — the paid webhook was missed and needs replaying.`,
    );
    throw Object.assign(
      new Error(
        `${provider.label} has already taken payment on this link, so it can't be cancelled. ` +
          `The payment record is out of date — ask an admin to replay the gateway webhook.`,
      ),
      { statusCode: 409 },
    );
  }

  if (!DEAD_LINK_STATUSES.has(remoteStatus)) throw gatewayError;

  // Normalize 'canceled' → our spelling. applyPaymentEvent is idempotent and
  // only advances from pending, so this is safe against a racing webhook.
  const status =
    remoteStatus === "expired" ? PAYMENT_STATUS.EXPIRED : PAYMENT_STATUS.CANCELLED;

  await applyPaymentEvent({
    provider: provider.key,
    paymentId: payment.id,
    status,
    linkStatus: status,
    note: `Reconciled with ${provider.label}: ${gatewayError.message}`,
  });

  const money = formatMoney(payment.amount, payment.currency);
  await Activity.create({
    lead_id: null,
    profile_id: payment.lead_profile_id,
    actor_id: null,
    type: "Payment",
    title: `Payment link already ${status} — ${money}`,
    details:
      `${provider.label} reports this link as ${status}; the record has been brought into line. ` +
      `${payment.description || ""}`.trim(),
    metadata: {
      action: "payment_link_reconciled",
      payment_id: payment.id,
      provider: provider.key,
      gateway_status: remoteStatus,
      gateway_message: gatewayError.message,
    },
  });

  return {
    reconciled: true,
    status,
    message: `This link had already ${status} at ${provider.label}. The payment record has been updated.`,
  };
}

/**
 * Cancel a pending payment link through its gateway.
 *
 * Returns { reconciled, status, message } — `reconciled: true` means the link
 * was already dead at the gateway and we corrected our record instead of
 * cancelling anything.
 */
async function cancelPaymentLink(paymentId) {
  const payment = await Payment.findByPk(paymentId, {
    include: [{ model: PaymentLink, as: "Link" }],
  });

  if (!payment) {
    throw new Error("Payment not found");
  }
  if (payment.status !== PAYMENT_STATUS.PENDING) {
    throw new Error("Only pending payment links can be cancelled");
  }

  const link = payment.Link;
  if (!link || !link.provider_link_id) {
    throw new Error("Payment link not found");
  }

  const provider = getProvider(link.provider);
  if (!provider) {
    throw new Error("Unknown payment provider");
  }

  try {
    await provider.cancelLink(link.provider_link_id);
  } catch (err) {
    // A refusal because the link isn't live is a reconcile signal, not a
    // failure — the operator's intent (this link must not take money) is
    // already satisfied.
    if (!err.notCancellable) throw err;
    return reconcileDeadLink({ payment, link, provider, gatewayError: err });
  }

  await Payment.update(
    { status: PAYMENT_STATUS.CANCELLED },
    { where: { id: paymentId } },
  );
  await PaymentLink.update(
    { status: "cancelled" },
    { where: { payment_id: paymentId } },
  );

  await Activity.create({
    lead_id: null,
    profile_id: payment.lead_profile_id,
    actor_id: null,
    type: "Payment",
    title: `Payment link cancelled — ${formatMoney(payment.amount, payment.currency)}`,
    details: `Cancelled payment link of ${formatMoney(payment.amount, payment.currency)}. ${payment.description || ""}`,
    metadata: {
      action: "payment_link_cancelled",
      payment_id: paymentId,
      amount: payment.amount,
      currency: payment.currency,
    },
  });

  return {
    reconciled: false,
    status: PAYMENT_STATUS.CANCELLED,
    message: "Payment link cancelled successfully",
  };
}

/**
 * Apply a normalized webhook event (from any provider's parseWebhook) to the
 * Payment + PaymentLink. Idempotent and order-independent:
 *   - the link status is always reflected (e.g. partially_paid is link-only)
 *   - the Payment only advances from `pending`, so duplicate or out-of-order
 *     events can't double-pay or downgrade a settled record.
 */
async function applyPaymentEvent(event) {
  if (!event || !event.paymentId) return;

  // Reflect the gateway's link status whenever provided.
  if (event.linkStatus) {
    await PaymentLink.update(
      {
        status: event.linkStatus,
        ...(event.providerRef ? { provider_ref: event.providerRef } : {}),
      },
      { where: { payment_id: event.paymentId } },
    );
  }

  // No payment-level transition (e.g. link-only partially_paid).
  if (!event.status) return;

  const payment = await Payment.findByPk(event.paymentId);
  if (!payment) return;

  // Monotonic guard — only advance from pending.
  if (payment.status !== PAYMENT_STATUS.PENDING) return;

  if (event.status === PAYMENT_STATUS.PAID) {
    const baseCurrency = event.baseCurrency || "INR";
    const baseAmount =
      event.baseAmountMinor != null
        ? fromSubunit(event.baseAmountMinor, baseCurrency)
        : Number(payment.amount); // no gateway base → presentment is the base (domestic)

    await Payment.update(
      {
        status: PAYMENT_STATUS.PAID,
        paid_at: event.paidAt || new Date(),
        base_amount: baseAmount,
        base_currency: baseCurrency,
        ...(event.feeMinor != null
          ? { fees: fromSubunit(event.feeMinor, baseCurrency) }
          : {}),
        ...(event.taxMinor != null
          ? { tax: fromSubunit(event.taxMinor, baseCurrency) }
          : {}),
        ...(event.feeType ? { fee_type: event.feeType } : {}),
      },
      { where: { id: event.paymentId, status: PAYMENT_STATUS.PENDING } },
    );

    // Activity log — show INR settlement for international payments.
    const presentmentCurrency = payment.currency || "INR";
    const isInternational = presentmentCurrency !== baseCurrency;
    const moneyLabel = formatMoney(payment.amount, presentmentCurrency);
    const settlementNote = isInternational
      ? ` · Settlement: ${formatMoney(baseAmount, baseCurrency)}`
      : "";
    const providerLabel = event.provider
      ? event.provider.charAt(0).toUpperCase() + event.provider.slice(1)
      : "Gateway";

    await Activity.create({
      lead_id: null,
      profile_id: payment.lead_profile_id,
      actor_id: null,
      type: "Payment",
      title: `Payment received — ${moneyLabel} via ${providerLabel}`,
      details: `Payment of ${moneyLabel} confirmed.${settlementNote}`,
      metadata: {
        action: "payment_received",
        payment_id: payment.id,
        amount: Number(payment.amount),
        currency: presentmentCurrency,
        base_amount: baseAmount,
        base_currency: baseCurrency,
        provider: event.provider || null,
        provider_ref: event.providerRef || null,
        lead_course_id: payment.lead_course_id || null,
      },
    });

    // Gateway-confirmed money onboards the customer immediately — there is no
    // human to wait for. `verification_status === null` is the discriminator:
    // anything non-null was typed in by hand and must go through the queue
    // instead (see paymentVerification.service#verifyPayment).
    //
    // Fire-and-forget, like the verification notifier. The webhook must return
    // 200 promptly or the gateway retries, and a mail failure is not a reason
    // to replay a payment event.
    if (payment.verification_status === null) {
      maybeAutoSendOnboarding({
        leadCourseId: payment.lead_course_id,
        paymentId: payment.id,
        purpose: payment.purpose,
      }).catch((err) =>
        console.error("[Payment] Auto onboarding send failed:", err.message),
      );
    }
  } else if (
    event.status === PAYMENT_STATUS.EXPIRED ||
    event.status === PAYMENT_STATUS.CANCELLED ||
    event.status === PAYMENT_STATUS.FAILED
  ) {
    await Payment.update(
      {
        status: event.status,
        ...(event.note ? { note: event.note } : {}),
      },
      { where: { id: event.paymentId, status: PAYMENT_STATUS.PENDING } },
    );
  }
}

module.exports = {
  validatePaymentTarget,
  recordManualPayment,
  generatePaymentLink,
  cancelPaymentLink,
  applyPaymentEvent,
};
