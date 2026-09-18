const { Op } = require('sequelize');
const { LeadCourse, Payment } = require('../models');
const { getScopedUserIds } = require('./dashboardScope');
const { hasGlobalScope } = require('../config/constants/roles');

/**
 * Authorization guard for per-document endpoints (receipt / invoice / statement
 * download + send). These endpoints take a raw id from the URL, so without a
 * scope check any authenticated user could fetch another team's document by
 * guessing the id. We gate by the enrollment's FROZEN owner (owner_agent_id) —
 * the same attribution the Enrollments/Invoices lists use.
 *
 *   - Superadmin: every enrollment
 *   - Manager:    enrollments owned by self or a direct report
 *   - Agent:      enrollments owned by self
 *
 * Throws an Error with statusCode 403 when the caller is out of scope. An
 * enrollment whose owner_agent_id is NULL ("Unassigned / Other") is visible to
 * Managers/Superadmins but not to Agents, mirroring the list scope.
 */
async function assertLeadCourseInScope(user, leadCourseId) {
  const course = await LeadCourse.findByPk(leadCourseId, {
    attributes: ['id', 'owner_agent_id'],
    raw: true,
  });
  if (!course) {
    throw Object.assign(new Error('Enrollment not found'), { statusCode: 404 });
  }

  const scopedUserIds = await getScopedUserIds(user);
  if (scopedUserIds === null) return; // Superadmin — unrestricted

  const ownerId = course.owner_agent_id ? String(course.owner_agent_id).toLowerCase() : null;

  // Unassigned/other enrollments: visible to Manager/Superadmin, not Agents.
  if (ownerId === null) {
    if (user.role === 'Agent') {
      throw Object.assign(new Error('You do not have access to this document.'), { statusCode: 403 });
    }
    return;
  }

  if (!scopedUserIds.includes(ownerId)) {
    throw Object.assign(new Error('You do not have access to this document.'), { statusCode: 403 });
  }
}

/**
 * Same guard, keyed by a payment id (receipts are per-payment). Resolves the
 * payment's enrollment, then defers to assertLeadCourseInScope. A payment with
 * no enrollment link can't yield a receipt anyway, so it's treated as 400.
 */
async function assertPaymentInScope(user, paymentId) {
  const payment = await Payment.findByPk(paymentId, {
    attributes: ['id', 'lead_course_id'],
    raw: true,
  });
  if (!payment) {
    throw Object.assign(new Error('Payment not found'), { statusCode: 404 });
  }
  if (!payment.lead_course_id) {
    throw Object.assign(
      new Error('This payment is not linked to a course enrollment'),
      { statusCode: 400 },
    );
  }
  await assertLeadCourseInScope(user, payment.lead_course_id);
}

/**
 * Guard for the per-LEAD payment views (the profile's payment list + overview).
 *
 * A profile has many enrollments and therefore no single owner, so the rule is
 * "can you see any of this lead's enrollments?". Passing returns the COMPLETE
 * history rather than a filtered subset — the due/paid figures on the same
 * screen are computed server-side from every payment, so showing a partial list
 * beside them would simply not add up.
 *
 * A profile with no enrollments at all (only standalone payment links) has no
 * owner to check, so it falls back to whether the caller recorded any of them.
 */
async function assertProfileInScope(user, profileId) {
  const scopedUserIds = await getScopedUserIds(user);
  if (scopedUserIds === null) return; // Superadmin / Program Manager

  const courses = await LeadCourse.findAll({
    where: { lead_profile_id: profileId },
    attributes: ['owner_agent_id'],
    raw: true,
  });

  const denied = () =>
    Object.assign(new Error("You do not have access to this lead's payments."), {
      statusCode: 403,
    });

  if (!courses.length) {
    const own = await Payment.count({
      where: { lead_profile_id: profileId, created_by: { [Op.in]: scopedUserIds } },
    });
    if (own > 0) return;
    throw denied();
  }

  const visible = courses.some((c) => {
    const ownerId = c.owner_agent_id ? String(c.owner_agent_id).toLowerCase() : null;
    // Unassigned enrollments: visible to Manager/Superadmin, not Agents —
    // mirrors assertLeadCourseInScope.
    if (ownerId === null) return user.role !== 'Agent';
    return scopedUserIds.includes(ownerId);
  });

  if (!visible) throw denied();
}

/**
 * Who may cancel a pending gateway payment link.
 *
 * Not simply a role gate: an Agent must be able to cancel a link they generated
 * themselves. So it's Superadmin/Program Manager, the person who created the
 * payment, or whoever owns the linked enrollment.
 */
async function assertCanCancelPayment(user, payment) {
  if (hasGlobalScope(user.role)) return;

  if (String(payment.created_by).toLowerCase() === String(user.id).toLowerCase()) return;

  if (payment.lead_course_id) {
    await assertLeadCourseInScope(user, payment.lead_course_id);
    return;
  }

  throw Object.assign(new Error('You do not have access to this payment link.'), {
    statusCode: 403,
  });
}

module.exports = {
  assertLeadCourseInScope,
  assertPaymentInScope,
  assertProfileInScope,
  assertCanCancelPayment,
};
