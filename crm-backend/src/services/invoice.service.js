const { Op } = require("sequelize");
const {
  Invoice,
  LeadCourse,
  LeadProfile,
  Payment,
  User,
} = require("../models");
const { PAYMENT_STATUS } = require("../config/constants/payment");
const { getScopedUserIds } = require("../utils/dashboardScope");


/**
 * DROPPED ENROLLMENTS ARE DELIBERATELY INCLUDED in the invoice list.
 *
 * An issued GST invoice remains a legally issued document after the student
 * leaves — it needs a credit note, not concealment. Only ISSUING a new invoice
 * is blocked on a dropped enrollment (see document.controller#issueInvoice).
 */
/** Derived receipt number for a paid payment — mirrors document.controller. */
function receiptNumber(paymentId) {
  return `RCPT-${String(paymentId).slice(0, 8).toUpperCase()}`;
}

/** Append a condition under where[Op.and] without clobbering existing scope. */
function mergeAnd(where, condition) {
  if (!where[Op.and]) where[Op.and] = [];
  where[Op.and].push(condition);
}

/**
 * Condition matching the "Unassigned / Other" owner bucket — enrollments whose
 * frozen owner is NULL or a user who is not currently an active Agent/Manager.
 * Mirrors leadCourse.service so the Invoices agent filter lines up with the
 * Enrollments list and the leaderboard reconciliation row.
 */
async function otherOwnerCondition() {
  const rows = await User.findAll({
    where: { [Op.not]: { is_active: true, role: { [Op.in]: ["Agent", "Manager"] } } },
    attributes: ["id"],
    raw: true,
  });
  const ids = rows.map((r) => r.id);
  return { [Op.or]: [{ owner_agent_id: null }, { owner_agent_id: { [Op.in]: ids } }] };
}

/**
 * List issued invoices visible to the caller, with their linked payment
 * receipts (paid payments on the enrollment).
 *
 * Scope (frozen owner_agent_id on the enrollment — same attribution as the
 * Enrollments list and the dashboard credit):
 *   - Superadmin: every invoice
 *   - Manager:    invoices on enrollments owned by self or a direct report
 *   - Agent:      invoices on enrollments owned by self
 *
 * Filters (all optional):
 *   - from, to:   window on invoices.created_at (issue date)
 *   - courseId:   single course_id match on the enrollment
 *   - agentIds:   narrow within scope to specific owners (Manager/Superadmin);
 *                 the special id "unassigned" includes the "Other" bucket
 *   - q:          free-text search across invoice number, invoice id, profile
 *                 (name/email/phone) AND linked receipt id / receipt number
 */
async function listInvoices({ user, filters = {} }) {
  const scopedUserIds = await getScopedUserIds(user);

  // Scope + course + agent constraints live on the LeadCourse the invoice
  // belongs to (the invoice itself carries no owner).
  const courseWhere = {};
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) return [];
    courseWhere.owner_agent_id = { [Op.in]: scopedUserIds };
  }
  if (filters.courseId) {
    courseWhere.course_id = filters.courseId;
  }

  if (filters.agentIds && filters.agentIds.length > 0 && user.role !== "Agent") {
    const ids = filters.agentIds.map((x) => String(x));
    const includeUnassigned = ids.includes("unassigned");
    const realAgentIds = ids.filter((x) => x !== "unassigned").map((x) => x.toLowerCase());

    const ors = [];
    if (realAgentIds.length > 0) ors.push({ owner_agent_id: { [Op.in]: realAgentIds } });
    if (includeUnassigned) ors.push(await otherOwnerCondition());
    if (ors.length === 0) return [];
    mergeAnd(courseWhere, ors.length === 1 ? ors[0] : { [Op.or]: ors });
  }

  // Issue-date window on the invoice itself.
  const where = {};
  if (filters.from && filters.to) {
    where.created_at = { [Op.between]: [filters.from, filters.to] };
  } else if (filters.from) {
    where.created_at = { [Op.gte]: filters.from };
  } else if (filters.to) {
    where.created_at = { [Op.lte]: filters.to };
  }

  const invoices = await Invoice.findAll({
    where,
    include: [
      {
        model: LeadCourse,
        as: "LeadCourse",
        required: true,
        where: courseWhere,
        // `status` drives the dropped marker on the invoices list. Invoices for
        // dropped enrollments are NOT hidden — the document was really issued
        // and remains a legal record.
        attributes: ["id", "course_id", "program_name", "cohort_name", "currency", "final_fee", "owner_agent_id", "status"],
        include: [
          { model: LeadProfile, as: "LeadProfile", attributes: ["id", "name", "email", "phone", "country_code"] },
          { model: User, as: "Owner", attributes: ["id", "name", "role", "is_active"] },
          {
            model: Payment,
            as: "Payments",
            attributes: ["id", "amount", "currency", "status", "paid_at", "source", "reference"],
          },
        ],
      },
      { model: User, as: "GeneratedBy", attributes: ["id", "name"] },
    ],
    order: [["created_at", "DESC"]],
  });

  const shaped = invoices.map((inv) => {
    const plain = inv.toJSON();
    const course = plain.LeadCourse || {};
    const profile = course.LeadProfile || null;
    const payments = course.Payments || [];

    // Linked receipts = paid payments on the enrollment, oldest first.
    const receipts = payments
      .filter((p) => p.status === PAYMENT_STATUS.PAID)
      .sort((a, b) => new Date(a.paid_at || 0) - new Date(b.paid_at || 0))
      .map((p) => ({
        id: p.id,
        receipt_number: receiptNumber(p.id),
        amount: Number(p.amount || 0),
        currency: p.currency || course.currency || "INR",
        paid_at: p.paid_at,
        source: p.source || null,
        reference: p.reference || null,
      }));

    const totalPaid = receipts.reduce((s, r) => s + r.amount, 0);

    return {
      id: plain.id,
      invoice_number: plain.invoice_number,
      created_at: plain.created_at || plain.createdAt,
      financial_year: plain.financial_year,
      buyer_type: plain.buyer_type,
      buyer_name: plain.buyer_name,
      buyer_email: plain.buyer_email,
      buyer_gstin: plain.buyer_gstin,
      total_amount: Number(plain.total_amount || 0),
      taxable_amount: Number(plain.taxable_amount || 0),
      gst_amount: Number(plain.gst_amount || 0),
      lead_course_id: course.id,
      course_id: course.course_id,
      program_name: course.program_name,
      // The invoice's OWN snapshot, not the enrollment's live cohort — a later
      // deferral must not change what an issued document says. Backfilled for
      // every pre-existing invoice.
      cohort_name: plain.cohort_name,
      // Lifecycle of the enrollment this invoice was issued against. Drives a
      // marker on the list only — the invoice itself stands regardless.
      enrollment_status: course.status,
      currency: course.currency || "INR",
      final_fee: Number(course.final_fee || 0),
      total_paid: totalPaid,
      generated_by: plain.GeneratedBy ? { id: plain.GeneratedBy.id, name: plain.GeneratedBy.name } : null,
      lead_owner: course.Owner
        ? { id: course.Owner.id, name: course.Owner.name, role: course.Owner.role, active: course.Owner.is_active }
        : null,
      profile: profile
        ? { id: profile.id, name: profile.name, email: profile.email, phone: profile.phone, country_code: profile.country_code }
        : null,
      receipts,
    };
  });

  // Free-text search applied in JS (mirrors listEnrollments' post-fetch
  // filtering). Resolves invoice number/id, profile fields, and — uniquely for
  // this list — a receipt id / receipt number to its parent invoice.
  const q = (filters.q || "").trim().toLowerCase();
  if (!q) return shaped;

  // A pasted receipt number looks like "RCPT-1A2B3C4D"; the underlying token is
  // the leading hex of the payment uuid.
  const receiptToken = q.startsWith("rcpt-") ? q.slice(5) : q;

  return shaped.filter((row) => {
    if (row.invoice_number && row.invoice_number.toLowerCase().includes(q)) return true;
    if (row.id && row.id.toLowerCase() === q) return true;
    const p = row.profile;
    if (p && [p.name, p.email, p.phone].some((v) => v && String(v).toLowerCase().includes(q))) return true;
    return row.receipts.some(
      (r) =>
        r.receipt_number.toLowerCase().includes(q) ||
        (receiptToken && r.id.toLowerCase().startsWith(receiptToken)),
    );
  });
}

/**
 * Distinct courses appearing in the caller's invoice scope — populates the
 * course filter dropdown without leaking out-of-scope courses.
 */
async function listInvoiceCourses({ user }) {
  const scopedUserIds = await getScopedUserIds(user);
  const courseWhere = {};
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) return [];
    courseWhere.owner_agent_id = { [Op.in]: scopedUserIds };
  }

  const rows = await Invoice.findAll({
    attributes: ["id"],
    include: [
      {
        model: LeadCourse,
        as: "LeadCourse",
        required: true,
        where: courseWhere,
        attributes: ["course_id", "program_name"],
      },
    ],
  });

  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const cid = r.LeadCourse?.course_id;
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);
    out.push({ course_id: cid, program_name: r.LeadCourse.program_name });
  }
  return out.sort((a, b) => String(a.program_name).localeCompare(String(b.program_name)));
}

module.exports = { listInvoices, listInvoiceCourses };
