const { Op, fn, col } = require("sequelize");
const {
  EmailTemplate,
  EmailLog,
  LeadCourse,
  LeadProfile,
  Payment,
  Activity,
} = require("../models");
const capitalize = require("../utils/helper/capitalize");
const { PAYMENT_STATUS, PAYMENT_PURPOSE } = require("../config/constants/payment");
const { ENROLLMENT_STATUS } = require("../config/constants/enrollment");
const { getSymbol } = require("../config/constants/currency");
const { wrapEmail } = require("../utils/email/emailWrapper");
const { sendEmail } = require("./email.service");
const { isProfileComplete } = require("./onboardingPortal.service");

/* ─── TEMPLATE TYPES ───────────────────────────────────── */

const TEMPLATE_TYPES = {
  COURSE_ONBOARDING: "COURSE_ONBOARDING",
};

/* ─── VARIABLES PER TYPE ───────────────────────────────── */

const TEMPLATE_VARIABLES_MAP = {
  [TEMPLATE_TYPES.COURSE_ONBOARDING]: {
    displayName: "Course Onboarding Email",
    variables: [
      { token: "{{name}}", description: "Lead's full name" },
      { token: "{{email}}", description: "Lead's email" },
      { token: "{{program_name}}", description: "Course / programme name" },
      {
        token: "{{cohort_name}}",
        description: "Cohort / batch name — renders blank if the enrollment has no cohort",
      },
      { token: "{{final_fee}}", description: "Final fee" },
      {
        token: "{{profile_form_link}}",
        description:
          "Link to the onboarding portal, where the student verifies by WhatsApp OTP and completes their profile",
      },
      {
        token: "{{#if_profile_pending}}…{{/if_profile_pending}}",
        description:
          "Wrap the profile ask in this block and it disappears entirely once the student has filled the form in",
      },
    ],
  },
};

/* ─── Token renderer ───────────────────────────────────────────────────────── */

/**
 * Conditional blocks the renderer understands. Deliberately a fixed, tiny list
 * rather than a general template language — templates are authored by staff in
 * a rich-text editor, and every construct we add is one more thing that can be
 * mis-typed into a broken email.
 *
 *   {{#if_profile_pending}} … {{/if_profile_pending}}
 *     Kept only when the student has not yet completed their onboarding
 *     profile. Stripping the WHOLE block — not just the link — is the point:
 *     otherwise a completed profile leaves an orphaned "please complete your
 *     profile:" sentence pointing at nothing.
 */
const CONDITIONAL_BLOCKS = ["if_profile_pending"];

/**
 * Replaces {{token}} placeholders in a string with values from a vars object.
 * Unknown tokens are left as-is so nothing silently vanishes.
 *
 * Conditional blocks are resolved first, so a false block's contents are gone
 * before token substitution ever sees them.
 */
function renderTemplate(template, vars = {}) {
  let out = String(template);

  for (const name of CONDITIONAL_BLOCKS) {
    // [\s\S] rather than . — the editor emits multi-line HTML inside the block.
    const block = new RegExp(
      `\\{\\{#${name}\\}\\}([\\s\\S]*?)\\{\\{\\/${name}\\}\\}`,
      "g",
    );
    out = out.replace(block, (_match, inner) => (vars[name] ? inner : ""));
  }

  return out.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] !== undefined && vars[key] !== null
      ? String(vars[key])
      : match;
  });
}

/* ─── CRUD ─────────────────────────────────────────────────────────────────── */

async function getAllTemplates() {
  return EmailTemplate.findAll({
    order: [["created_at", "DESC"]],
  });
}

async function getTemplateById(id) {
  const template = await EmailTemplate.findByPk(id);
  if (!template) throw new Error("Email template not found");
  return template;
}

async function createTemplate({ name, subject, html_body, created_by, type, course_id }) {
  if (!name?.trim()) throw new Error("Template name is required");
  if (!subject?.trim()) throw new Error("Subject is required");
  if (!html_body?.trim()) throw new Error("Email body is required");
  if (!type) throw new Error("Template type is required");

  if (!TEMPLATE_VARIABLES_MAP[type]) {
    throw new Error("Invalid template type");
  }

  // Course onboarding templates are per-course — a course_id is required and
  // each course may own at most one.
  const courseId = course_id?.trim() || null;
  if (type === TEMPLATE_TYPES.COURSE_ONBOARDING && !courseId) {
    throw new Error("Course is required for an onboarding template");
  }

  const existing = await EmailTemplate.findOne({
    where: { type, course_id: courseId },
  });
  if (existing) {
    throw new Error("A template already exists for this course");
  }

  return EmailTemplate.create({
    name: name.trim(),
    type,
    course_id: courseId,
    subject: subject.trim(),
    html_body,
    is_active: false,
    created_by,
  });
}

async function updateTemplate(id, updates) {
  const template = await getTemplateById(id);

  const allowed = ["name", "subject", "html_body"];
  allowed.forEach((field) => {
    if (updates[field] !== undefined) {
      template[field] =
        typeof updates[field] === "string"
          ? updates[field].trim()
          : updates[field];
    }
  });

  await template.save();
  return template;
}

async function deleteTemplate(id) {
  const template = await getTemplateById(id);
  await template.destroy();
  return { success: true };
}

/**
 * Activates a template. Uniqueness is per (type, course_id), so this scopes the
 * "deactivate siblings" sweep to the same course — activating one course's
 * onboarding template never touches another course's.
 */
async function setActiveTemplate(id) {
  const template = await getTemplateById(id);

  await EmailTemplate.update(
    { is_active: false },
    { where: { type: template.type, course_id: template.course_id } },
  );

  template.is_active = true;
  await template.save();

  return template;
}

/**
 * Deactivates the currently active template (turns off auto-send).
 */
async function deactivateTemplate(id) {
  const template = await getTemplateById(id);
  template.is_active = false;
  await template.save();
  return template;
}

/* ─── Core send logic ──────────────────────────────────────────────────────── */

/**
 * Builds the variable map for a given LeadCourse enrollment.
 * Called both for real onboarding sends and preview sends.
 */
async function buildVarsForEnrollment(leadCourse, overrides = {}) {
  // LeadCourse may already have the profile attached — if not, fetch it
  const profile = leadCourse.LeadProfile || (await leadCourse.getLeadProfile());

  // Format the fee in the enrollment's own currency, not a hard-coded ₹.
  const currency = leadCourse.currency || "INR";
  const feeNumber = Number(leadCourse.final_fee);
  const formattedFee = Number.isFinite(feeNumber)
    ? `${getSymbol(currency)}${feeNumber.toLocaleString(currency === "INR" ? "en-IN" : "en-US")}`
    : "";

  return {
    name: capitalize(overrides.name || profile?.name || "there"),
    email: overrides.email || profile?.email || "",
    program_name: leadCourse.program_name || "",
    cohort_name: leadCourse.cohort_name || "",
    final_fee: formattedFee,
    profile_form_link: process.env.PUBLIC_FORM_URL || "",
    if_profile_pending: await isProfilePending(profile?.id),
  };
}

/**
 * Should this email still ask them to complete their profile?
 *
 * Fails OPEN — a lookup error means we show the ask. A duplicate request is a
 * mild annoyance; a missing one loses the data permanently, and this runs
 * inside maybeAutoSendOnboarding, which is called from a payment webhook and
 * from payment verification and may not fail because a query did.
 */
async function isProfilePending(leadProfileId) {
  if (!leadProfileId) return true;
  try {
    return !(await isProfileComplete(leadProfileId));
  } catch (err) {
    console.error(
      "[onboarding] profile completion lookup failed, showing the ask anyway:",
      err.message,
    );
    return true;
  }
}

/**
 * Logs an email send attempt to email_logs.
 */
async function logEmail({
  lead_course_id,
  template_id,
  recipient_email,
  subject,
  status,
  error_message,
}) {
  return EmailLog.create({
    lead_course_id: lead_course_id || null,
    template_id,
    recipient_email,
    subject,
    status,
    error_message: error_message || null,
    sent_at: status !== "failed" ? new Date() : null,
  });
}

/* ─── Onboarding send (manual / opt-in — never automatic) ──────────────────── */

/**
 * Resolves the active onboarding template for a given course. Strictly
 * per-course: returns null when the course has no active template (no fallback).
 */
async function resolveActiveOnboardingTemplate(courseId) {
  if (!courseId) return null;
  return EmailTemplate.findOne({
    where: {
      type: TEMPLATE_TYPES.COURSE_ONBOARDING,
      course_id: courseId,
      is_active: true,
    },
  });
}

/**
 * Course IDs that currently have an active onboarding template. Drives the
 * frontend gating (enroll checkbox + "Send Onboarding" button).
 */
async function listActiveOnboardingCourseIds() {
  const rows = await EmailTemplate.findAll({
    where: {
      type: TEMPLATE_TYPES.COURSE_ONBOARDING,
      is_active: true,
      course_id: { [Op.ne]: null },
    },
    attributes: ["course_id"],
    raw: true,
  });
  return [...new Set(rows.map((r) => r.course_id))];
}

/**
 * Latest successful onboarding-send timestamp per lead_course_id.
 * Returns { [leadCourseId]: ISOString }.
 */
async function getOnboardingStatusMap(leadCourseIds = []) {
  if (!leadCourseIds.length) return {};
  const logs = await EmailLog.findAll({
    where: {
      lead_course_id: { [Op.in]: leadCourseIds },
      status: "sent",
    },
    include: [
      {
        model: EmailTemplate,
        as: "EmailTemplate",
        attributes: [],
        where: { type: TEMPLATE_TYPES.COURSE_ONBOARDING },
        required: true,
      },
    ],
    attributes: ["lead_course_id", "sent_at"],
    order: [["sent_at", "DESC"]],
    raw: true,
  });

  const map = {};
  for (const l of logs) {
    if (!map[l.lead_course_id]) map[l.lead_course_id] = l.sent_at;
  }
  return map;
}

/**
 * Addresses blind-copied on every real onboarding send, from ONBOARDING_BCC.
 *
 * Comma-separated so the list can change without a deploy; unset or blank means
 * nobody is copied and the message is exactly what it was before. Blind rather
 * than visible: this is internal oversight, so the student never sees the
 * address and a reply-all cannot pull it onto the thread.
 *
 * Deliberately NOT applied to sendPreviewEmail: a preview goes to the admin who
 * asked for it, and copying the list on every template tweak would bury them in
 * drafts of an email no student has received.
 *
 * The recipient is filtered out so a lead whose own address is on the list is
 * not sent the same message twice.
 */
function onboardingBccList(recipientEmail = "") {
  const to = String(recipientEmail).trim().toLowerCase();
  return String(process.env.ONBOARDING_BCC || "")
    .split(",")
    .map((address) => address.trim())
    .filter(Boolean)
    .filter((address) => address.toLowerCase() !== to);
}

/**
 * Renders and sends the onboarding email for one enrollment, then logs it.
 * Returns a result object rather than throwing so callers (enrollment,
 * manual send) can report the outcome without failing their own flow.
 *
 * @param {object} leadCourse       - LeadCourse instance (LeadProfile may be attached)
 * @param {object} [opts]
 * @param {string} [opts.email]     - Recipient override (defaults to profile email)
 * @param {string} [opts.name]      - Name override (defaults to profile name)
 * @returns {Promise<{sent:boolean, reason?:string, error?:string}>}
 */
async function sendOnboardingForCourse(leadCourse, opts = {}) {
  const template = await resolveActiveOnboardingTemplate(leadCourse.course_id);
  if (!template) return { sent: false, reason: "no_template" };

  const vars = await buildVarsForEnrollment(leadCourse, opts);
  const recipientEmail = opts.email || vars.email;
  if (!recipientEmail) return { sent: false, reason: "no_email" };

  const renderedSubject = renderTemplate(template.subject, vars);
  const renderedBody = renderTemplate(template.html_body, vars);
  const wrappedBody = wrapEmail({
    bodyHtml: renderedBody,
    preheader: renderedSubject,
  });

  const bccList = onboardingBccList(recipientEmail);

  try {
    await sendEmail({
      to: recipientEmail,
      subject: renderedSubject,
      html: wrappedBody,
      bcc: bccList,
    });

    await logEmail({
      lead_course_id: leadCourse.id,
      template_id: template.id,
      recipient_email: recipientEmail,
      subject: renderedSubject,
      status: "sent",
    });

    // Audit trail on the profile timeline.
    if (leadCourse.lead_profile_id) {
      await Activity.create({
        lead_id: null,
        profile_id: leadCourse.lead_profile_id,
        actor_id: opts.actorId || null,
        type: "Audit",
        title: `Onboarding email sent — ${leadCourse.program_name}`,
        details: `Course onboarding email sent to ${recipientEmail} for ${leadCourse.program_name}.`,
        metadata: {
          action: "onboarding_email_sent",
          lead_course_id: leadCourse.id,
          course_id: leadCourse.course_id,
          program_name: leadCourse.program_name,
          template_id: template.id,
          recipient_email: recipientEmail,
          // email_logs has no column for this, so the timeline is the only
          // record of who else received the mail.
          bcc: bccList,
        },
      }).catch((actErr) =>
        console.error("[EmailTemplate] Failed to log onboarding activity:", actErr.message),
      );
    }

    console.info(
      `[EmailTemplate] Onboarding email sent to ${recipientEmail} for course ${leadCourse.id}`,
    );
    return { sent: true };
  } catch (err) {
    console.error("[EmailTemplate] Failed to send onboarding email:", err.message);
    await logEmail({
      lead_course_id: leadCourse.id,
      template_id: template.id,
      recipient_email: recipientEmail,
      subject: renderedSubject,
      status: "failed",
      error_message: err.message,
    }).catch((logErr) =>
      console.error("[EmailTemplate] Also failed to log email error:", logErr.message),
    );
    return { sent: false, reason: "error", error: err.message };
  }
}

/**
 * Has any money actually landed on this enrollment?
 *
 * Onboarding is a post-payment email, so this is the gate on every send path.
 * `status='paid'` is the right test on its own: a manual entry awaiting approval
 * is 'pending', and a rejected one is 'cancelled', so neither counts until a
 * verifier promotes it.
 */
async function countPaidPayments(leadCourseId, excludePaymentId = null) {
  return Payment.count({
    where: {
      lead_course_id: leadCourseId,
      status: PAYMENT_STATUS.PAID,
      ...(excludePaymentId ? { id: { [Op.ne]: excludePaymentId } } : {}),
    },
  });
}

/**
 * Auto-send hook. Called from the two — and only two — places a payment becomes
 * status='paid': the gateway webhook (applyPaymentEvent) and manual verification
 * (verifyPayment).
 *
 * Fires only on the FIRST paid payment of an enrollment, so a lead part-way
 * through an instalment plan never gets an onboarding email on their next
 * instalment. Skips silently when the course has no active template or the lead
 * has no email — a Superadmin / Program Manager can still send by hand later.
 *
 * Never throws. It runs inside a gateway webhook and inside payment approval,
 * and neither may fail because an email did.
 */
async function maybeAutoSendOnboarding({ leadCourseId, paymentId = null, purpose = null }) {
  if (!leadCourseId) return { sent: false, reason: "no_enrollment" };

  // A deferral fee is not the student paying for the course, so it must not
  // trigger the welcome email. Without this a student who enrols, pays nothing,
  // and is then moved to a later batch gets welcomed to the programme by a
  // rescheduling charge. Note this only skips the TRIGGER: countPaidPayments
  // below still counts deferral fees, so a later real instalment still reads as
  // "not the first payment".
  if (purpose === PAYMENT_PURPOSE.DEFERRAL_FEE) {
    return { sent: false, reason: "deferral_fee" };
  }

  try {
    const leadCourse = await LeadCourse.findByPk(leadCourseId, {
      include: [{ model: LeadProfile, as: "LeadProfile", attributes: ["id", "name", "email"] }],
    });
    if (!leadCourse) return { sent: false, reason: "no_enrollment" };

    // Never welcome a student who has just left. Silent skip rather than a
    // throw: this is fire-and-forget from the webhook and verification paths,
    // where an exception would be swallowed anyway.
    if (leadCourse.status === ENROLLMENT_STATUS.DROPPED) {
      return { sent: false, reason: "enrollment_dropped" };
    }

    // Any OTHER paid payment means the onboarding moment has already passed,
    // whether or not an email actually went out at the time.
    if (await countPaidPayments(leadCourseId, paymentId)) {
      return { sent: false, reason: "not_first_payment" };
    }

    // Re-read the log immediately before sending rather than trusting the count
    // above. A webhook retry and two verifiers clicking at once both land here
    // concurrently, and email_logs is the only record that survives both.
    const sentMap = await getOnboardingStatusMap([leadCourseId]);
    if (sentMap[leadCourseId]) return { sent: false, reason: "already_sent" };

    // actorId stays null — nobody clicked this, the payment did.
    return await sendOnboardingForCourse(leadCourse, { actorId: null });
  } catch (err) {
    console.error("[EmailTemplate] Auto onboarding send failed:", err.message);
    return { sent: false, reason: "error", error: err.message };
  }
}

/**
 * Would these enrollments auto-send an onboarding email if their first payment
 * landed right now? Drives the forward-looking notices in the verify and collect
 * modals, so a verifier knows their click also mails the customer.
 *
 * Batched: three queries for a whole page of queue rows rather than three per
 * row. Each entry is { leadCourseId, courseId, email }.
 *
 * The conditions below MUST stay in step with maybeAutoSendOnboarding — if they
 * drift, the UI promises a send that never happens (or stays silent about one
 * that does).
 */
async function getOnboardingEligibilityMap(entries = []) {
  const rows = entries.filter((e) => e && e.leadCourseId);
  if (!rows.length) return {};

  const leadCourseIds = [...new Set(rows.map((e) => String(e.leadCourseId)))];

  const [paidRows, activeCourseIds, sentMap] = await Promise.all([
    Payment.findAll({
      where: {
        lead_course_id: { [Op.in]: leadCourseIds },
        status: PAYMENT_STATUS.PAID,
      },
      attributes: ["lead_course_id", [fn("COUNT", col("id")), "count"]],
      group: ["lead_course_id"],
      raw: true,
    }),
    listActiveOnboardingCourseIds(),
    getOnboardingStatusMap(leadCourseIds),
  ]);

  // The payment being judged is still 'pending', so it isn't in here — any hit
  // means OTHER money already landed and the onboarding moment has passed.
  const alreadyPaid = new Set(paidRows.map((r) => String(r.lead_course_id)));
  const activeTemplates = new Set(activeCourseIds);

  const map = {};
  for (const e of rows) {
    const id = String(e.leadCourseId);
    map[id] =
      !alreadyPaid.has(id) &&
      !sentMap[id] &&
      activeTemplates.has(e.courseId) &&
      Boolean(e.email);
  }
  return map;
}

/**
 * Manual send-after-enrollment: looks up the enrollment (with profile) by id and
 * sends its onboarding email. Throws user-facing errors so the controller maps
 * them to the right status code / message.
 */
async function sendOnboardingByLeadCourseId({ leadCourseId, name, email, actorId }) {
  const leadCourse = await LeadCourse.findByPk(leadCourseId, {
    include: [{ model: LeadProfile, as: "LeadProfile", attributes: ["id", "name", "email"] }],
  });
  if (!leadCourse) throw new Error("Enrolled course not found");

  if (leadCourse.status === ENROLLMENT_STATUS.DROPPED) {
    throw Object.assign(
      new Error("This enrollment has been dropped — onboarding cannot be sent"),
      { statusCode: 409, code: "ENROLLMENT_DROPPED" },
    );
  }

  // Enforced here and not only in the UI — the route is reachable directly, and
  // "only after the first payment" is the whole point of the flow.
  if (!(await countPaidPayments(leadCourseId))) {
    throw Object.assign(
      new Error(
        "Onboarding can only be sent once this enrollment's first payment has been received and verified",
      ),
      { statusCode: 409 },
    );
  }

  const recipientEmail = email?.trim() || leadCourse.LeadProfile?.email || "";
  if (!recipientEmail) throw new Error("No recipient email address");

  const result = await sendOnboardingForCourse(leadCourse, {
    email: recipientEmail,
    name: name?.trim() || undefined,
    actorId: actorId || null,
  });

  if (!result.sent) {
    if (result.reason === "no_template") {
      throw new Error("No onboarding template configured for this course");
    }
    throw new Error(result.error || "Failed to send onboarding email");
  }

  return { success: true, message: `Onboarding email sent to ${recipientEmail}` };
}

/* ─── Preview send (admin triggers from settings UI) ───────────────────────── */

/**
 * Sends a preview of a specific template to the requesting
 * Uses dummy variable values so the user can see how the template renders.
 *
 * @param {string} templateId  - ID of the template to preview
 * @param {string} name  - Name of the requesting user
 * @param {string} email  - Email of the requesting user
 */
async function sendPreviewEmail({ templateId, name, email }) {
  const template = await getTemplateById(templateId);

  const dummyVars = {
    name: name || "there",
    email,
    program_name: "PM Fellowship",
    // Every token the template may contain needs a dummy here, or the preview
    // emails the raw {{token}} to the admin previewing it.
    cohort_name: "Cohort 12 — Aug 2026",
    final_fee: "₹49,999",
    start_date: "01 Aug 2025",
    cohort_start_date: "01 Aug 2025",
    // Real link, and the block forced on, so the admin previewing sees exactly
    // what a student with an incomplete profile gets. There is nothing to mint
    // and nothing to leak — the portal authenticates by phone + OTP, so this
    // URL is the same for everyone and grants nothing on its own.
    profile_form_link: process.env.PUBLIC_FORM_URL || "#",
    if_profile_pending: true,
  };

  const renderedSubject = `[PREVIEW] ${renderTemplate(template.subject, dummyVars)}`;
  const renderedBody = renderTemplate(template.html_body, dummyVars);
  const wrappedBody = wrapEmail({
    bodyHtml: renderedBody,
    preheader: renderTemplate(template.subject, dummyVars),
  });

  await sendEmail({
    to: email,
    subject: renderedSubject,
    html: wrappedBody,
  });

  await logEmail({
    lead_course_id: null,
    template_id: templateId,
    recipient_email: email,
    subject: renderedSubject,
    status: "preview",
  });

  return { success: true, message: `Preview sent to ${email}` };
}

/* ─── Exports ──────────────────────────────────────────────────────────────── */
module.exports = {
  TEMPLATE_VARIABLES_MAP,
  getAllTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  setActiveTemplate,
  deactivateTemplate,
  sendOnboardingForCourse,
  sendOnboardingByLeadCourseId,
  maybeAutoSendOnboarding,
  countPaidPayments,
  getOnboardingEligibilityMap,
  resolveActiveOnboardingTemplate,
  listActiveOnboardingCourseIds,
  getOnboardingStatusMap,
  sendPreviewEmail,
  renderTemplate,
};
