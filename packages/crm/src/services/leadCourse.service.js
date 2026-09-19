const { Op } = require("sequelize");
const {
  LeadCourse,
  Payment,
  PaymentLink,
  Activity,
  LeadProfile,
  User,
  Cohort,
  Invoice,
  EnrollmentCohortChange,
  sequelize,
} = require("../models");
const {
  PAYMENT_STATUS,
  PAYMENT_PURPOSE,
  VERIFICATION_STATUS,
} = require("../config/constants/payment");
const {
  ENROLLMENT_STATUS,
  ENROLLMENT_STATUS_FILTER,
  ENROLLMENT_STATUS_FILTERS,
  DROP_REASON_MIN,
  DROP_REASON_MAX,
  DEFERRAL_REASON_MIN,
  DEFERRAL_REASON_MAX,
  resolveLifecycle,
} = require("../config/constants/enrollment");
const { formatMoney } = require("../config/constants/currency");
const { ROLES } = require("../config/constants/roles");
const { enrollmentCurrencies } = require("../config/payment/providers");
const { cascadeAgentToProfileLeads } = require("./lead.service");
const { getScopedUserIds } = require("../utils/dashboardScope");
const { assertLeadCourseInScope } = require("../utils/documentScope");
const {
  getOnboardingStatusMap,
  listActiveOnboardingCourseIds,
} = require("./emailTemplate.service");

// Indian GST rate. Applied to INR enrollments only; international prices are
// treated as all-inclusive (no GST added).
const GST_RATE = 0.18;

// Courses whose catalog price is quoted GST-inclusive. This only seeds the
// DEFAULT for the enroll dialog's "Price includes GST" checkbox — the agent can
// override it per enrollment (e.g. when back-dating an older enrollment that was
// sold GST-exclusive), and the chosen value is snapshotted to
// lead_courses.gst_inclusive. Keyed by course_id (the catalog's program_name
// slug); mirrored by GST_INCLUSIVE_COURSES in the enroll dialog
// (tps-crm/src/components/LeadProfile/PaymentTab/PaymentTab.tsx).
const GST_INCLUSIVE_COURSES = new Set(["pm_fellowship"]);

/**
 * Price breakdown for an enrollment. Shared by enrollCourse and
 * updateAgentDiscount so both paths agree.
 *
 * Inclusive enrollments derive GST from finalFee — after the agent discount —
 * because the discount comes off a gross amount and leaves it gross. That keeps
 * an invoice's taxable + GST reconciling to the amount actually charged. The
 * exclusive path keeps its original ordering (GST on the subtotal, agent
 * discount applied after), so existing enrollments are unaffected.
 */
function computeBreakdown({
  gstInclusive,
  coursePrice,
  platformDiscountPercent,
  agentDiscountAmount,
  currency,
}) {
  const agentDiscount = agentDiscountAmount || 0;
  const discountedPrice =
    coursePrice - Math.round((coursePrice * platformDiscountPercent) / 100);

  // GST is Indian-only; international prices are treated as all-inclusive.
  if (currency !== "INR") {
    return {
      discountedPrice,
      gstAmount: 0,
      totalWithGst: discountedPrice,
      finalFee: Math.max(0, discountedPrice - agentDiscount),
    };
  }

  if (gstInclusive) {
    const finalFee = Math.max(0, discountedPrice - agentDiscount);
    return {
      discountedPrice,
      gstAmount: Math.round(finalFee - finalFee / (1 + GST_RATE)),
      totalWithGst: discountedPrice,
      finalFee,
    };
  }

  const gstAmount = Math.round(discountedPrice * GST_RATE);
  const totalWithGst = discountedPrice + gstAmount;
  return {
    discountedPrice,
    gstAmount,
    totalWithGst,
    finalFee: Math.max(0, totalWithGst - agentDiscount),
  };
}

/**
 * Resolve the canonical lead owner for a profile, returning the agent_id to
 * snapshot onto a new enrollment (or null for unassigned/other).
 *
 * Uses the same priority order as the enrollment list's owner column so the
 * frozen value matches what users already see:
 *   1. active Agent/Manager  2. active Superadmin  3. inactive owner
 *   4. unassigned (agent_id IS NULL)
 * Ties broken by most recent lead (source_created_at, then created_at).
 */
async function resolveProfileOwnerAgentId(profileId, transaction) {
  const rows = await sequelize.query(
    `
    SELECT DISTINCT ON (l.profile_id)
      l.agent_id
    FROM leads l
    LEFT JOIN users u ON u.id = l.agent_id
    WHERE l.profile_id = :profileId
      AND l.is_deleted = false
    ORDER BY
      l.profile_id,
      CASE
        WHEN u.is_active = true AND u.role IN ('Agent', 'Manager') THEN 0
        WHEN u.is_active = true                                    THEN 1
        WHEN l.agent_id IS NULL                                    THEN 3
        ELSE 2
      END,
      l.source_created_at DESC NULLS LAST,
      l.created_at        DESC NULLS LAST
    `,
    { replacements: { profileId }, type: sequelize.QueryTypes.SELECT, transaction },
  );
  return rows[0]?.agent_id || null;
}

/**
 * Append a condition under where[Op.and] without clobbering an existing
 * owner_agent_id scope already set on the where clause.
 */
function mergeAnd(where, condition) {
  if (!where[Op.and]) where[Op.and] = [];
  where[Op.and].push(condition);
}

/**
 * Sequelize condition matching enrollments in the "Unassigned / Other" bucket:
 * those whose snapshotted owner is NULL, or is a user who is not currently an
 * active Agent/Manager (Superadmin-owned or since-deactivated). Mirrors the
 * leaderboard's "Other" reconciliation row.
 */
async function otherOwnerCondition() {
  const rows = await User.findAll({
    where: { [Op.not]: { is_active: true, role: { [Op.in]: ["Agent", "Manager"] } } },
    attributes: ["id"],
    raw: true,
  });
  const ids = rows.map((r) => r.id);
  return {
    [Op.or]: [{ owner_agent_id: null }, { owner_agent_id: { [Op.in]: ids } }],
  };
}

/**
 * A dropped enrollment is frozen: no discount edits, no cohort moves, no new
 * money. Reinstate it first if it needs changing.
 */
function assertNotDropped(course) {
  if (course.status === ENROLLMENT_STATUS.DROPPED) {
    throw Object.assign(
      new Error("This enrollment has been dropped and can no longer be edited"),
      { statusCode: 409, code: "ENROLLMENT_DROPPED" },
    );
  }
}

/**
 * Create one enrollment row plus its activity entry.
 *
 * Shared by enrollCourse and reEnrollCourse so the two agree on pricing, the
 * owner snapshot, the unowned-profile claim and the audit trail. Everything
 * that DIFFERS between them — the duplicate guard, who may call it — stays with
 * the caller; this performs no authorisation and no uniqueness check of its own.
 *
 * Computes final_fee = (course_price - platform_discount) - agent_discount.
 */
async function createEnrollmentRow({
  profileId,
  userId,
  courseId,
  programName,
  coursePrice,
  platformDiscountPercent,
  agentDiscountAmount,
  cohortId,
  currency,
  enrolledAt,
  gstInclusive,
  isReenrollment = false,
}) {
  const cur = String(currency || "INR").toUpperCase();
  if (!enrollmentCurrencies().includes(cur)) {
    throw new Error(`Unsupported currency: ${cur}`);
  }

  // Resolve the chosen cohort and snapshot its name.
  let cohortName = null;
  if (cohortId) {
    const cohort = await Cohort.findByPk(cohortId);
    if (!cohort) {
      throw new Error("Selected cohort not found");
    }
    cohortName = cohort.name;
  }

  // The dialog sends the agent's choice; fall back to the course default when
  // the caller omits it. Non-INR is always all-inclusive with no GST recorded,
  // so the flag is meaningless there and forced off.
  const inclusive =
    cur === "INR" &&
    (typeof gstInclusive === "boolean"
      ? gstInclusive
      : GST_INCLUSIVE_COURSES.has(courseId));

  const { gstAmount, finalFee } = computeBreakdown({
    gstInclusive: inclusive,
    coursePrice,
    platformDiscountPercent,
    agentDiscountAmount,
    currency: cur,
  });

  // Snapshot the lead owner now so this enrollment stays credited to them even
  // if the lead is reassigned later. This is the lead OWNER, not necessarily
  // the user clicking Enroll (a Manager may enroll on an agent's behalf).
  //
  // A re-enrollment runs the SAME resolver, deliberately: it belongs to whoever
  // owns the lead today, not to whoever owned it when the student first joined.
  let ownerAgentId = await resolveProfileOwnerAgentId(profileId);

  // Nobody owns this profile — every lead under it is still in the pool. The
  // person closing the sale claims it: all of the profile's leads are assigned
  // to them and the enrollment is credited to them, instead of the sale landing
  // in the "Unassigned / Other" bucket on every dashboard. Only when the profile
  // is unowned; an existing owner always keeps the credit, even when someone
  // else does the enrolling.
  if (!ownerAgentId && userId) {
    const actor = await User.findByPk(userId, { attributes: ["id", "role"] });
    // A Program Manager is read-only over leads and never a lead owner, so
    // their enrollments stay unattributed, as before.
    if (actor && actor.role !== ROLES.PROGRAM_MANAGER) {
      ownerAgentId = actor.id;
      await cascadeAgentToProfileLeads(
        profileId,
        actor.id,
        actor.id,
        undefined,
        "Enrollment",
        "Unowned profile claimed by the enrolling user",
      );
    }
  }

  // Honour a custom (back-dated) enrolled date when supplied. Sequelize keeps
  // an explicitly-provided timestamp instead of overwriting it with NOW. Both
  // attribute spellings are set so the value survives regardless of how the
  // underscored timestamp attribute is named.
  const enrolledAtDate =
    enrolledAt instanceof Date && !Number.isNaN(enrolledAt.getTime())
      ? enrolledAt
      : null;

  const leadCourse = await LeadCourse.create({
    lead_profile_id: profileId,
    created_by: userId,
    owner_agent_id: ownerAgentId,
    course_id: courseId,
    program_name: programName,
    currency: cur,
    course_price: coursePrice,
    platform_discount_percent: platformDiscountPercent,
    agent_discount_amount: agentDiscountAmount || 0,
    gst_amount: gstAmount,
    gst_inclusive: inclusive,
    final_fee: finalFee,
    cohort_id: cohortId || null,
    cohort_name: cohortName,
    is_reenrollment: isReenrollment,
    ...(enrolledAtDate
      ? { created_at: enrolledAtDate, createdAt: enrolledAtDate }
      : {}),
  });

  const verb = isReenrollment ? "Re-enrolled" : "Enrolled";

  // Log activity
  await Activity.create({
    lead_id: null,
    profile_id: profileId,
    actor_id: userId,
    type: "Payment",
    title: `${verb} in ${programName}`,
    details: `${verb} profile in ${programName}${cohortName ? ` (${cohortName})` : ""}. Course price: ${formatMoney(coursePrice, cur)}, Platform discount: ${platformDiscountPercent}%, GST: ${formatMoney(gstAmount, cur)}, Agent discount: ${formatMoney(agentDiscountAmount || 0, cur)}, Final fee: ${formatMoney(finalFee, cur)}.`,
    metadata: {
      action: isReenrollment ? "course_reenrolled" : "course_enrolled",
      lead_course_id: leadCourse.id,
      course_id: courseId,
      program_name: programName,
      currency: cur,
      course_price: coursePrice,
      platform_discount_percent: platformDiscountPercent,
      agent_discount_amount: agentDiscountAmount || 0,
      gst_amount: gstAmount,
      gst_inclusive: inclusive,
      final_fee: finalFee,
      cohort_id: cohortId || null,
      cohort_name: cohortName,
      is_reenrollment: isReenrollment,
    },
  });

  return leadCourse;
}

/**
 * Enroll a profile into a course for the first time.
 *
 * The duplicate guard is deliberately STRICT — any existing row for this
 * profile+course refuses, dropped ones included. Coming back after dropping out
 * is a re-enrollment: a different action, at a different price, restricted to
 * different roles. Loosening this to `status = active` would quietly turn the
 * ordinary Enroll button into a back door around all of that.
 */
async function enrollCourse(params) {
  const existing = await LeadCourse.findOne({
    where: {
      lead_profile_id: params.profileId,
      course_id: params.courseId,
    },
    attributes: ["id"],
  });

  if (existing) {
    throw new Error("Profile is already enrolled in this course");
  }

  return createEnrollmentRow({ ...params, isReenrollment: false });
}

/**
 * Re-enroll a profile whose earlier enrollment in this course was dropped.
 *
 * A NEW row, at today's date and today's price. The old row keeps its own date,
 * its payments and its invoice — the two are independent records of two
 * separate periods of study, and nothing passes between them. Whatever the
 * student paid the first time is forfeited; they owe the full new fee.
 *
 * Superadmin / ProgramManager only (enforced at the route).
 */
async function reEnrollCourse({
  user,
  sourceLeadCourseId,
  coursePrice,
  platformDiscountPercent,
  agentDiscountAmount,
  cohortId,
  currency,
  gstInclusive,
}) {
  await assertLeadCourseInScope(user, sourceLeadCourseId);

  const source = await LeadCourse.findByPk(sourceLeadCourseId);
  if (!source) throw httpError(404, "Enrollment not found", "NOT_FOUND");

  if (source.status !== ENROLLMENT_STATUS.DROPPED) {
    throw httpError(
      409,
      "Only a dropped enrollment can be re-enrolled. Drop the current one first if the student is starting over.",
      "NOT_DROPPED",
    );
  }

  // Belt and braces with the partial unique index. The index is the real
  // guarantee; this turns a constraint violation into a message that says what
  // to do about it.
  const activeSibling = await LeadCourse.findOne({
    where: {
      lead_profile_id: source.lead_profile_id,
      course_id: source.course_id,
      status: ENROLLMENT_STATUS.ACTIVE,
    },
    attributes: ["id"],
  });
  if (activeSibling) {
    throw httpError(
      409,
      "This profile already has an active enrollment in this course.",
      "ALREADY_ACTIVE",
      { activeLeadCourseId: activeSibling.id },
    );
  }

  const price = Number(coursePrice);
  if (!Number.isFinite(price) || price <= 0) {
    throw httpError(400, "A course price is required", "INVALID_PRICE");
  }

  // Course identity comes from the SOURCE row, never the request — a
  // re-enrollment is into the same course by definition. Price and cohort come
  // from the caller, because both have usually moved on since.
  return createEnrollmentRow({
    profileId: source.lead_profile_id,
    userId: user.id,
    courseId: source.course_id,
    programName: source.program_name,
    coursePrice: price,
    platformDiscountPercent: Number(platformDiscountPercent) || 0,
    agentDiscountAmount: Number(agentDiscountAmount) || 0,
    cohortId: cohortId || null,
    currency: currency || source.currency,
    // No back-dating. A re-enrollment starts now — that new date is the entire
    // point of it being a new row.
    enrolledAt: null,
    gstInclusive: typeof gstInclusive === "boolean" ? gstInclusive : undefined,
    isReenrollment: true,
  });
}

/**
 * Get all enrolled courses for a profile with payment summary.
 * Returns each course with totalPaid and dueAmount.
 */
async function getProfileCourses(profileId) {
  const courses = await LeadCourse.findAll({
    where: { lead_profile_id: profileId },
    include: [
      {
        // Who ended the enrollment. Null on every active row.
        model: User,
        as: "DroppedBy",
        attributes: ["id", "name", "role"],
      },
      {
        model: Payment,
        as: "Payments",
        attributes: ["id", "amount", "status", "verification_status", "paid_at", "created_at", "purpose"],
        include: [
          {
            model: PaymentLink,
            as: "Link",
            attributes: ["provider", "url", "status", "provider_link_id", "expire_by"],
          },
        ],
      },
      {
        model: Invoice,
        as: "Invoice",
        attributes: [
          "id", "invoice_number", "created_at",
          "buyer_type", "buyer_name", "buyer_email", "buyer_gstin", "buyer_contact_name", "buyer_address", "buyer_phone",
        ],
      },
    ],
    order: [["created_at", "DESC"]],
  });

  // Onboarding email status: when each course was last sent (for the "Sent on"
  // badge + re-send warning) and which courses have an active template (gates
  // the "Send Onboarding" button).
  const [onboardingSentMap, activeOnboardingCourseIds] = await Promise.all([
    getOnboardingStatusMap(courses.map((c) => c.id)),
    listActiveOnboardingCourseIds(),
  ]);
  const activeOnboardingSet = new Set(activeOnboardingCourseIds);

  // Latest enrollment per course. Computed here rather than queried because
  // this endpoint already loads EVERY row for the profile, so the set is
  // complete. Ordering must match reinstateEnrollment: enrollment date, then id.
  const latestPerCourse = new Map();
  for (const c of courses) {
    const prev = latestPerCourse.get(c.course_id);
    const newer =
      !prev ||
      new Date(c.created_at) > new Date(prev.created_at) ||
      (new Date(c.created_at).getTime() === new Date(prev.created_at).getTime() &&
        String(c.id) > String(prev.id));
    if (newer) latestPerCourse.set(c.course_id, c);
  }

  return courses.map((course) => {
    const plain = course.toJSON();

    // The course ledger only. A deferral fee is a separate charge with its own
    // total and its own payments; folding the two together would make "fully
    // paid" on the course depend on an unrelated admin fee.
    const isCourseFee = (p) =>
      (p.purpose || PAYMENT_PURPOSE.COURSE_FEE) === PAYMENT_PURPOSE.COURSE_FEE;

    const coursePayments = (plain.Payments || []).filter(isCourseFee);
    const deferralPayments = (plain.Payments || []).filter((p) => !isCourseFee(p));

    const paidPayments = coursePayments.filter(
      (p) => p.status === PAYMENT_STATUS.PAID,
    );

    const totalPaid = paidPayments.reduce((sum, p) => sum + p.amount, 0);

    const deferralFeeTotal = Number(plain.deferral_fee_total || 0);
    const deferralPaid = deferralPayments
      .filter((p) => p.status === PAYMENT_STATUS.PAID)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    // When the first money actually landed. Gates the onboarding email — it may
    // only go out after a payment is received (gateway) or verified (manual).
    // `paid_at` is the receipt date, preserved through approval, so a backdated
    // entry still reports when the customer paid rather than when it was typed.
    const firstPaymentAt = paidPayments.reduce((earliest, p) => {
      const at = p.paid_at || p.created_at;
      if (!at) return earliest;
      return !earliest || new Date(at) < new Date(earliest) ? at : earliest;
    }, null);

    // Both of these are status='pending', so they must be told apart by
    // verification_status: money the customer hasn't paid yet (a live gateway
    // link) versus money we've received but haven't approved yet.
    const pendingAmount = (plain.Payments || [])
      .filter((p) => p.status === PAYMENT_STATUS.PENDING && !p.verification_status)
      .reduce((sum, p) => sum + p.amount, 0);

    const awaitingVerificationAmount = (plain.Payments || [])
      .filter((p) => p.verification_status === VERIFICATION_STATUS.PENDING)
      .reduce((sum, p) => sum + p.amount, 0);

    // "Has anything at all ever been attempted against this enrollment?" —
    // including cancelled and rejected rows, deliberately. It drives the
    // wizard's "Continue setup" affordance, and an enrollment whose only
    // payment was cancelled has still been through the flow once, so offering
    // to resume it would be wrong.
    const hasPayments = (plain.Payments || []).length > 0;

    // Same split as listEnrollments: on a drop the outstanding balance stops
    // being owed and becomes forfeited, so the profile's tiles don't chase money
    // nobody will collect. See the comment there.
    const isDropped = plain.status === ENROLLMENT_STATUS.DROPPED;
    const balance = Math.max(0, plain.final_fee - totalPaid);

    return {
      ...plain,
      totalPaid,
      pendingAmount,
      awaitingVerificationAmount,
      // Unverified money is still owed — it only clears the due on approval.
      dueAmount: isDropped ? 0 : balance,
      forfeitedAmount: isDropped ? balance : 0,
      isDropped,
      // The deferral ledger, reported alongside the course one rather than
      // merged into it — see listEnrollments.
      deferralFeeTotal,
      deferralPaid,
      deferralDue: Math.max(0, deferralFeeTotal - deferralPaid),
      lifecycle: resolveLifecycle(plain),
      droppedBy: plain.DroppedBy
        ? { id: plain.DroppedBy.id, name: plain.DroppedBy.name, role: plain.DroppedBy.role }
        : null,
      // Only the latest enrollment for a course may be reinstated — see
      // reinstateEnrollment. Drives whether the menu item renders at all.
      canReinstate:
        isDropped && latestPerCourse.get(plain.course_id)?.id === plain.id,
      firstPaymentAt,
      hasPayments,
      onboardingSentAt: onboardingSentMap[plain.id] || null,
      hasOnboardingTemplate: activeOnboardingSet.has(plain.course_id),
    };
  });
}

/**
 * Update agent discount on an enrolled course.
 * Recalculates gst_amount and final_fee via computeBreakdown, so the course's
 * GST mode (inclusive vs exclusive) is honoured on edit as well as on enroll.
 */
async function updateAgentDiscount({ leadCourseId, agentDiscountAmount }) {
  const course = await LeadCourse.findByPk(leadCourseId);
  if (!course) {
    throw new Error("Enrolled course not found");
  }
  assertNotDropped(course);

  const cur = course.currency || "INR";
  // Use the mode snapshotted at enroll time, not the course's current default —
  // an enrollment sold GST-exclusive must keep recomputing that way.
  const { gstAmount, finalFee } = computeBreakdown({
    gstInclusive: course.gst_inclusive,
    coursePrice: course.course_price,
    platformDiscountPercent: course.platform_discount_percent,
    agentDiscountAmount,
    currency: cur,
  });

  const oldDiscount = course.agent_discount_amount;

  await course.update({
    agent_discount_amount: agentDiscountAmount || 0,
    gst_amount: gstAmount,
    final_fee: finalFee,
  });

  // Log activity
  await Activity.create({
    lead_id: null,
    profile_id: course.lead_profile_id,
    actor_id: null,
    type: "Payment",
    title: `Agent discount updated for ${course.program_name}`,
    details: `Agent discount changed from ${formatMoney(oldDiscount, cur)} to ${formatMoney(agentDiscountAmount || 0, cur)}. New final fee: ${formatMoney(finalFee, cur)}.`,
    metadata: {
      action: "agent_discount_updated",
      lead_course_id: leadCourseId,
      program_name: course.program_name,
      old_agent_discount: oldDiscount,
      new_agent_discount: agentDiscountAmount || 0,
      final_fee: finalFee,
    },
  });

  return course;
}

/**
 * List enrollments visible to the caller, with optional filters.
 *
 * Scope semantics (mirrors the dashboard's conversion attribution — the
 * agent_profile_pairs CTE used in leaderboard/scorecard/sumRevenue): an
 * enrollment is visible to a user iff that user (or their direct report) has
 * at least one lead on the enrollment's profile. This reconciles the count
 * shown here with the "conversions" KPI on the dashboard, regardless of who
 * actually clicked "Enroll" (often a Manager/Superadmin acting on behalf of
 * the lead-owning agent).
 *
 *   - Superadmin: every enrollment
 *   - Manager:    enrollments on profiles where self or any direct report has a lead
 *   - Agent:      enrollments on profiles where self has a lead
 *
 * Filters (all optional):
 *   - from, to:       window on lead_courses.created_at
 *   - paymentFrom,
 *     paymentTo:      window on payments.paid_at — keep an enrollment if it has
 *                     ANY paid payment whose paid_at falls in the window. This
 *                     matches the dashboard's revenue_total semantics (which
 *                     sums all paid payments in window, including later
 *                     instalments of older enrolments), and is what powers the
 *                     drill-through from the leaderboard's "Unassigned / Other"
 *                     reconciliation row.
 *   - courseId:       single course_id match
 *   - agentId:        narrow to a specific agent's profile-set (Manager/Superadmin only)
 *   - paymentStatus:  'paid' | 'partial' | 'unpaid' (computed after payment aggregation)
 */
async function listEnrollments({ user, filters = {} }) {
  const scopedUserIds = await getScopedUserIds(user);

  // Scope by the FROZEN owner snapshotted at enroll time, not by current lead
  // ownership. Reassigning a lead no longer moves its past enrollments.
  const where = {};
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) return [];
    where.owner_agent_id = { [Op.in]: scopedUserIds };
  }

  // Lifecycle view. Defaults to ACTIVE so the day-to-day list is the working
  // set, not a graveyard.
  //
  // The one exception is the revenue drill-through: a payment window means the
  // caller arrived from a revenue figure, and that figure INCLUDES money
  // collected on enrollments that were later dropped (design §3.4-C). Defaulting
  // to active there would land them on a list that doesn't add up to the number
  // they clicked. An explicit ?status= still wins, so the drill-through can be
  // narrowed by hand.
  const hasPaymentWindow = Boolean(filters.paymentFrom || filters.paymentTo);
  const requestedStatus = ENROLLMENT_STATUS_FILTERS.includes(filters.status)
    ? filters.status
    : hasPaymentWindow
      ? ENROLLMENT_STATUS_FILTER.ALL
      : ENROLLMENT_STATUS_FILTER.ACTIVE;

  // `deferred` and `reenrolled` are VIEWS over active enrollments, not stored
  // statuses — both describe a student who is still enrolled, so they narrow
  // the active set rather than sitting beside it. Everything else maps straight
  // through.
  if (requestedStatus === ENROLLMENT_STATUS_FILTER.DEFERRED) {
    where.status = ENROLLMENT_STATUS.ACTIVE;
    where.is_deferred = true;
  } else if (requestedStatus === ENROLLMENT_STATUS_FILTER.REENROLLED) {
    where.status = ENROLLMENT_STATUS.ACTIVE;
    where.is_reenrollment = true;
  } else if (requestedStatus !== ENROLLMENT_STATUS_FILTER.ALL) {
    where.status = requestedStatus;
  }

  if (filters.from && filters.to) {
    where.created_at = { [Op.between]: [filters.from, filters.to] };
  } else if (filters.from) {
    where.created_at = { [Op.gte]: filters.from };
  } else if (filters.to) {
    where.created_at = { [Op.lte]: filters.to };
  }

  if (filters.courseId) {
    where.course_id = filters.courseId;
  }

  // Current cohort — "who is running in this batch".
  if (filters.cohortIds && filters.cohortIds.length > 0) {
    where.cohort_id = { [Op.in]: filters.cohortIds };
  }

  // The batch they were SOLD into — "who did this cohort recruit", which still
  // counts a student who has since deferred out of it.
  if (filters.originalCohortIds && filters.originalCohortIds.length > 0) {
    where.original_cohort_id = { [Op.in]: filters.originalCohortIds };
  }

  // Multi-agent filter (Manager/Superadmin). Narrows within the already-scoped
  // profile set to profiles where any of the selected agents has a lead. The
  // special id "unassigned" includes profiles with no active Agent/Manager
  // owner (the leaderboard's "Unassigned / Other" bucket). Agents cannot widen
  // to other users, so this is ignored for them.
  if (filters.agentIds && filters.agentIds.length > 0 && user.role !== "Agent") {
    const ids = filters.agentIds.map((x) => String(x));
    const includeUnassigned = ids.includes("unassigned");
    const realAgentIds = ids
      .filter((x) => x !== "unassigned")
      .map((x) => x.toLowerCase());

    const ors = [];
    if (realAgentIds.length > 0) {
      ors.push({ owner_agent_id: { [Op.in]: realAgentIds } });
    }
    if (includeUnassigned) {
      ors.push(await otherOwnerCondition());
    }
    if (ors.length === 0) return [];
    mergeAnd(where, ors.length === 1 ? ors[0] : { [Op.or]: ors });
  }

  // agentState='other' mirrors the leaderboard's "Unassigned / Other" bucket:
  // enrollments whose lead-profile has NO active Agent/Manager owner — i.e.
  // every lead on the profile is either unassigned, owned by an inactive
  // user, or owned by a Superadmin. Lets users drill from the leaderboard
  // reconciliation row into the actual enrollments behind it. Agents never
  // see this row, so this filter is restricted to Manager/Superadmin.
  if (filters.agentState === "other" && user.role !== "Agent") {
    mergeAnd(where, await otherOwnerCondition());
  }

  const rows = await LeadCourse.findAll({
    where,
    include: [
      {
        model: LeadProfile,
        as: "LeadProfile",
        attributes: ["id", "name", "phone", "country_code", "email"],
      },
      {
        model: User,
        as: "Creator",
        attributes: ["id", "name", "role"],
      },
      {
        // Frozen lead owner snapshotted at enroll time. Null when the
        // enrollment was created with no Agent/Manager owner on the profile.
        model: User,
        as: "Owner",
        attributes: ["id", "name", "role", "is_active"],
      },
      {
        // Who ended the enrollment. Null on every active row.
        model: User,
        as: "DroppedBy",
        attributes: ["id", "name", "role"],
      },
      {
        model: Payment,
        as: "Payments",
        attributes: ["id", "amount", "status", "verification_status", "paid_at", "purpose"],
      },
      {
        model: Invoice,
        as: "Invoice",
        attributes: [
          "id", "invoice_number", "created_at",
          "buyer_type", "buyer_name", "buyer_email", "buyer_gstin", "buyer_contact_name", "buyer_address", "buyer_phone",
        ],
      },
    ],
    order: [["created_at", "DESC"]],
  });

  // Pre-compute the payment-window bounds once (filter applies to every row).
  let paymentFromMs = -Infinity;
  let paymentToMs = Infinity;
  if (filters.paymentFrom) {
    paymentFromMs = new Date(filters.paymentFrom).getTime();
  }
  if (filters.paymentTo) {
    const raw = filters.paymentTo;
    paymentToMs = /^\d{4}-\d{2}-\d{2}$/.test(raw)
      ? new Date(`${raw}T23:59:59.999Z`).getTime()
      : new Date(raw).getTime();
  }

  const shaped = [];
  for (const row of rows) {
    const plain = row.toJSON();
    const allPayments = plain.Payments || [];

    // Two ledgers on one enrollment: the course fee the student enrolled at,
    // and any rescheduling fees charged since. Every figure below — collected,
    // due, forfeited, payment_status — is the COURSE ledger, so Total Fee keeps
    // meaning the sale and the tiles keep reconciling. Deferral money is
    // reported separately in deferral_* below.
    const payments = allPayments.filter(
      (p) => (p.purpose || PAYMENT_PURPOSE.COURSE_FEE) === PAYMENT_PURPOSE.COURSE_FEE,
    );
    const deferralPayments = allPayments.filter(
      (p) => p.purpose === PAYMENT_PURPOSE.DEFERRAL_FEE,
    );

    const paidPayments = payments.filter((p) => p.status === PAYMENT_STATUS.PAID);
    const totalPaid = paidPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const deferralFeeTotal = Number(plain.deferral_fee_total || 0);
    const deferralPaid = deferralPayments
      .filter((p) => p.status === PAYMENT_STATUS.PAID)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    // Manually-recorded payments still in the approval queue. Surfaced as its
    // own figure so a row reading "Due" is explainable rather than alarming.
    // Counted across BOTH ledgers — it answers "is anything of mine stuck in
    // the queue", which does not care what the money was for.
    const awaitingVerification = allPayments.filter(
      (p) => p.verification_status === VERIFICATION_STATUS.PENDING,
    );
    const awaitingVerificationAmount = awaitingVerification.reduce(
      (sum, p) => sum + Number(p.amount || 0),
      0,
    );
    const paidTimestamps = paidPayments
      .map((p) => (p.paid_at ? new Date(p.paid_at).getTime() : null))
      .filter((t) => t !== null);

    // Drop enrolments with no paid payment in the payment window. This mirrors
    // sumRevenue.revenue_total (any paid payment in window), so a later
    // instalment of an older enrolment still surfaces — which is what makes
    // the "Other" drill-through actually show the rows behind the revenue.
    if (hasPaymentWindow) {
      const inWindow = paidTimestamps.some((t) => t >= paymentFromMs && t <= paymentToMs);
      if (!inWindow) continue;
    }

    const firstPaidAt = paidTimestamps.length > 0 ? new Date(Math.min(...paidTimestamps)) : null;
    const lastPaidAt = paidTimestamps.length > 0 ? new Date(Math.max(...paidTimestamps)) : null;
    const isDropped = plain.status === ENROLLMENT_STATUS.DROPPED;

    // The balance splits in two on a drop. What is still owed becomes what will
    // never be paid: due_amount → 0 so Outstanding stops counting money nobody
    // is chasing, and the same figure reappears as forfeited_amount so it is
    // still visible and Total Fee still reconciles:
    //   Total Fee = Collected + Outstanding + Forfeited
    const balance = Math.max(0, Number(plain.final_fee) - totalPaid);
    const dueAmount = isDropped ? 0 : balance;
    const forfeitedAmount = isDropped ? balance : 0;

    let paymentStatus;
    if (totalPaid <= 0) paymentStatus = "unpaid";
    else if (balance <= 0) paymentStatus = "paid";
    else paymentStatus = "partial";

    shaped.push({
      id: plain.id,
      // Sequelize emits `createdAt` (camelCase) in toJSON() even when the
      // underlying column is `created_at`. Read both to be safe.
      created_at: plain.created_at || plain.createdAt,
      // Not exposed to the client — only used below to resolve which row of a
      // profile+course pair is the latest. Deleted before the payload is sent.
      _lead_profile_id: plain.lead_profile_id,
      course_id: plain.course_id,
      program_name: plain.program_name,
      cohort_id: plain.cohort_id,
      cohort_name: plain.cohort_name,
      // The batch this seat was sold into. Equal to cohort_* until the student
      // is deferred; after that the pair reads "Cohort 4 → Cohort 6".
      original_cohort_id: plain.original_cohort_id,
      original_cohort_name: plain.original_cohort_name,
      is_deferred: Boolean(plain.is_deferred),
      deferred_at: plain.deferred_at || null,
      deferral_count: Number(plain.deferral_count || 0),
      // The second ledger — kept apart from final_fee/total_paid/due_amount on
      // purpose, so the course fee's arithmetic is unaffected by admin charges.
      deferral_fee_total: deferralFeeTotal,
      deferral_paid: deferralPaid,
      deferral_due: Math.max(0, deferralFeeTotal - deferralPaid),
      currency: plain.currency || "INR",
      course_price: plain.course_price,
      platform_discount_percent: plain.platform_discount_percent,
      agent_discount_amount: plain.agent_discount_amount,
      gst_amount: plain.gst_amount,
      final_fee: plain.final_fee,
      total_paid: totalPaid,
      due_amount: dueAmount,
      forfeited_amount: forfeitedAmount,
      payment_status: paymentStatus,
      // Lifecycle state, derived rather than stored. `is_reenrollment` is a
      // property of how the row was CREATED and stays true after a later drop,
      // so `dropped` has to win — a dropped re-enrollment is dropped.
      status: plain.status,
      lifecycle: resolveLifecycle(plain),
      is_reenrollment: Boolean(plain.is_reenrollment),
      dropped_at: plain.dropped_at || null,
      drop_reason: plain.drop_reason || null,
      dropped_by: plain.DroppedBy
        ? { id: plain.DroppedBy.id, name: plain.DroppedBy.name, role: plain.DroppedBy.role }
        : null,
      awaiting_verification_count: awaitingVerification.length,
      awaiting_verification_amount: awaitingVerificationAmount,
      first_paid_at: firstPaidAt ? firstPaidAt.toISOString() : null,
      last_paid_at: lastPaidAt ? lastPaidAt.toISOString() : null,
      profile: plain.LeadProfile
        ? {
            id: plain.LeadProfile.id,
            name: plain.LeadProfile.name,
            phone: plain.LeadProfile.phone,
            country_code: plain.LeadProfile.country_code,
            email: plain.LeadProfile.email,
          }
        : null,
      // Lead owner frozen at enroll time — same person the leaderboard
      // credits. Null when no owner was snapshotted. May be inactive or a
      // Superadmin (the "Other" bucket on the leaderboard).
      lead_owner: plain.Owner
        ? {
            id: plain.Owner.id,
            name: plain.Owner.name,
            role: plain.Owner.role,
            active: plain.Owner.is_active,
          }
        : null,
      // Whoever clicked "Enroll". Often the same as lead_owner but not always
      // (e.g. a Manager enrolling on behalf of their agent's lead).
      creator: plain.Creator
        ? { id: plain.Creator.id, name: plain.Creator.name, role: plain.Creator.role }
        : null,
      // Issued GST invoice (null until explicitly issued). Drives the
      // Issue-vs-Download/Email state in the enrollment list.
      invoice: plain.Invoice
        ? {
            id: plain.Invoice.id,
            invoice_number: plain.Invoice.invoice_number,
            buyer_type: plain.Invoice.buyer_type,
            buyer_name: plain.Invoice.buyer_name,
            buyer_email: plain.Invoice.buyer_email,
            buyer_gstin: plain.Invoice.buyer_gstin,
            buyer_contact_name: plain.Invoice.buyer_contact_name,
            buyer_address: plain.Invoice.buyer_address,
            buyer_phone: plain.Invoice.buyer_phone,
          }
        : null,
    });
  }

  const filtered =
    filters.paymentStatus && ["paid", "partial", "unpaid"].includes(filters.paymentStatus)
      ? shaped.filter((r) => r.payment_status === filters.paymentStatus)
      : shaped;

  // Onboarding-email status, for the send/resend control in the expanded row.
  // Two batched queries for the whole list, and only over the rows that
  // survived filtering — `first_paid_at` above already carries the payment gate.
  const [sentMap, activeCourseIds, latestIds] = await Promise.all([
    getOnboardingStatusMap(filtered.map((r) => r.id)),
    listActiveOnboardingCourseIds(),
    latestEnrollmentIds(filtered.map((r) => r._lead_profile_id)),
  ]);
  const activeOnboardingSet = new Set(activeCourseIds);

  return filtered.map(({ _lead_profile_id, ...r }) => ({
    ...r,
    onboarding_sent_at: sentMap[r.id] || null,
    has_onboarding_template: activeOnboardingSet.has(r.course_id),
    // Only the latest enrollment for a profile+course may be reinstated, so the
    // menu item is hidden rather than offered and then refused. The service
    // enforces the same rule — this only keeps the UI honest.
    can_reinstate: r.status === ENROLLMENT_STATUS.DROPPED && latestIds.has(r.id),
  }));
}

/**
 * The id of the most recent enrollment for each (profile, course) pair among
 * the given profiles.
 *
 * A separate query rather than a computation over the list: the list is scoped
 * and filtered, so a row's newer sibling may not be in it — deriving "latest"
 * from what happens to be on screen would call a superseded row the latest one
 * the moment someone filters to the Dropped view.
 *
 * Ordering matches reinstateEnrollment exactly. If the two ever disagree the UI
 * offers a button the server refuses, which is the bug this exists to prevent.
 */
async function latestEnrollmentIds(profileIds) {
  const ids = [...new Set((profileIds || []).filter(Boolean))];
  if (ids.length === 0) return new Set();

  const rows = await sequelize.query(
    `
    SELECT DISTINCT ON (lead_profile_id, course_id) id
    FROM lead_courses
    WHERE lead_profile_id IN (:ids)
    ORDER BY lead_profile_id, course_id, created_at DESC, id DESC
    `,
    { replacements: { ids }, type: sequelize.QueryTypes.SELECT },
  );
  return new Set(rows.map((r) => r.id));
}

/**
 * Distinct courses appearing in the caller's enrollment scope.
 * Used to populate the course filter dropdown without leaking out-of-scope courses.
 */
async function listEnrollmentCourses({ user }) {
  const scopedUserIds = await getScopedUserIds(user);
  const where = {};
  if (scopedUserIds !== null) {
    if (scopedUserIds.length === 0) return [];
    where.owner_agent_id = { [Op.in]: scopedUserIds };
  }

  const rows = await LeadCourse.findAll({
    where,
    attributes: ["course_id", "program_name"],
    order: [["program_name", "ASC"]],
  });

  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const cid = r.course_id;
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);
    out.push({ course_id: cid, program_name: r.program_name });
  }
  return out;
}

/* -------------------------------------------------------------------------
 * Cohort deferral
 *
 * Moving a student to a later batch. Superadmin / ProgramManager only (enforced
 * at the route), one entry point, and every move recorded — see
 * COHORT_DEFERRAL_PLAN.md.
 *
 * What moves and what does not:
 *   - cohort_id moves; original_cohort_id is frozen on the first deferral
 *   - money already RECEIVED stays with the batch it was received under
 *     (payments carry their own cohort snapshot); money still PENDING is
 *     re-stamped, because it belongs to the batch the student is in when it
 *     finally lands
 *   - the sale does not move: owner_agent_id, created_at, final_fee, the
 *     invoice and its number are all untouched
 * ---------------------------------------------------------------------- */

/**
 * Resolve the effective date of a lifecycle event. Defaults to now; a
 * caller-supplied date is honoured so an August entry for a July decision
 * counts from July. Bounded to [enrolled_at, now] — it can neither predate the
 * enrollment nor be scheduled into the future.
 *
 * Shared by drop and deferral so the two agree on what a valid date is.
 */
function resolveEffectiveDate(value, enrolledAt, { label, code }) {
  if (!value) return new Date();

  const when = new Date(value);
  if (Number.isNaN(when.getTime())) {
    throw httpError(400, `Invalid ${label.toLowerCase()}`, code);
  }

  if (when.getTime() > Date.now()) {
    throw httpError(400, `${label} cannot be in the future`, code);
  }

  const start = enrolledAt ? new Date(enrolledAt) : null;
  if (start && when.getTime() < start.getTime()) {
    throw httpError(
      400,
      `${label} cannot be before the enrollment date`,
      code,
    );
  }

  return when;
}

/**
 * Validate the fee attached to a deferral. Optional — most moves carry none.
 *
 * A flat amount: no GST is derived for it and it never touches final_fee. It is
 * its own ledger on the enrollment, collected by payments carrying
 * purpose='deferral_fee'.
 */
function validateDeferralFee(fee) {
  if (!fee || fee.amount === undefined || fee.amount === null || fee.amount === "") {
    return { amount: 0, collectNow: false };
  }

  const amount = Number(fee.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw httpError(400, "Deferral fee must be greater than zero", "INVALID_FEE");
  }

  return {
    amount,
    collectNow: Boolean(fee.collectNow),
    source: fee.source,
    reference: fee.reference || null,
    note: fee.note || null,
    paidAt: fee.paidAt || null,
    files: fee.files || [],
  };
}

/**
 * Move an enrollment to a different cohort, recording it as a deferral.
 *
 * Scope-checked here so an out-of-scope id cannot be moved by guessing it — the
 * endpoint this replaces had no such check, and no role check either.
 *
 * The fee payment is created AFTER the transaction commits and never rolls it
 * back: a failed proof upload or a rejected amount must not undo a deferral
 * that is otherwise valid. The charge is already on deferral_fee_total by then,
 * so it can be collected afterwards from the row's normal Collect action.
 */
async function changeEnrollmentCohort({ user, leadCourseId, toCohortId, reason, effectiveAt, fee }) {
  const trimmedReason = validateReason(reason, DEFERRAL_REASON_MIN, DEFERRAL_REASON_MAX);
  const deferralFee = validateDeferralFee(fee);

  await assertLeadCourseInScope(user, leadCourseId);

  if (!toCohortId) {
    throw httpError(400, "A target cohort is required", "COHORT_REQUIRED");
  }

  const { course, change } = await sequelize.transaction(async (t) => {
    const row = await LeadCourse.findByPk(leadCourseId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!row) throw httpError(404, "Enrollment not found", "NOT_FOUND");

    // A dropped enrollment is frozen — reinstate it before moving it.
    if (row.status === ENROLLMENT_STATUS.DROPPED) {
      throw httpError(
        409,
        "This enrollment has been dropped and can no longer be moved. Reinstate it first.",
        "ENROLLMENT_DROPPED",
      );
    }

    if (String(row.cohort_id || "") === String(toCohortId)) {
      throw httpError(
        400,
        "The enrollment is already in that cohort",
        "SAME_COHORT",
      );
    }

    const target = await Cohort.findByPk(toCohortId, { transaction: t });
    if (!target) throw httpError(404, "Selected cohort not found", "COHORT_NOT_FOUND");

    // A cohort belongs to one programme, or to none (a general cohort usable by
    // any). Moving a student into another programme's batch is not a deferral,
    // it is a data error — and the endpoint this replaces allowed it.
    if (target.course_id && String(target.course_id) !== String(row.course_id)) {
      throw httpError(
        400,
        `"${target.name}" belongs to a different programme`,
        "COHORT_WRONG_COURSE",
      );
    }

    if (!target.is_active) {
      throw httpError(
        400,
        `"${target.name}" is no longer running`,
        "COHORT_INACTIVE",
      );
    }

    const effective = resolveEffectiveDate(effectiveAt, row.created_at, {
      label: "Effective date",
      code: "INVALID_EFFECTIVE_DATE",
    });

    const fromCohortId = row.cohort_id || null;
    const fromCohortName = row.cohort_name || null;

    // Claimed once, on the first move, from wherever the student then was.
    // After that it is the answer to "which batch was this seat sold into",
    // which no later deferral may change.
    const claimsOriginal = row.deferral_count === 0;

    await row.update(
      {
        cohort_id: target.id,
        cohort_name: target.name,
        ...(claimsOriginal
          ? {
              original_cohort_id: fromCohortId,
              original_cohort_name: fromCohortName,
            }
          : {}),
        is_deferred: true,
        deferred_at: effective,
        deferral_count: row.deferral_count + 1,
        deferral_fee_total:
          Number(row.deferral_fee_total || 0) + deferralFee.amount,
        // status stays 'active' — a deferred student is still enrolled and
        // still owes money. See is_deferred on the model.
      },
      { transaction: t },
    );

    // Unrecognised money follows the student. Anything already paid (or
    // cancelled, or rejected) keeps the cohort it was received under, which is
    // what stops a deferral rewriting a closed month.
    await Payment.update(
      { cohort_id: target.id, cohort_name: target.name },
      {
        where: {
          lead_course_id: row.id,
          status: PAYMENT_STATUS.PENDING,
        },
        transaction: t,
      },
    );

    const created = await EnrollmentCohortChange.create(
      {
        lead_course_id: row.id,
        from_cohort_id: fromCohortId,
        from_cohort_name: fromCohortName,
        to_cohort_id: target.id,
        to_cohort_name: target.name,
        reason: trimmedReason,
        effective_at: effective,
        deferral_fee_amount: deferralFee.amount,
        changed_by: user.id,
      },
      { transaction: t },
    );

    const money = deferralFee.amount
      ? ` Deferral fee: ${formatMoney(deferralFee.amount, row.currency)}.`
      : "";

    await Activity.create(
      {
        lead_id: null,
        profile_id: row.lead_profile_id,
        actor_id: user.id,
        type: "Audit",
        title: `Cohort changed — ${row.program_name}`,
        details: `Moved from "${fromCohortName || "no cohort"}" to "${target.name}", effective ${effective.toISOString().slice(0, 10)}.${money} ${trimmedReason}`,
        metadata: {
          action: "enrollment_cohort_changed",
          lead_course_id: row.id,
          course_id: row.course_id,
          program_name: row.program_name,
          from_cohort_id: fromCohortId,
          from_cohort_name: fromCohortName,
          to_cohort_id: target.id,
          to_cohort_name: target.name,
          original_cohort_name: claimsOriginal
            ? fromCohortName
            : row.original_cohort_name,
          effective_at: effective,
          reason: trimmedReason,
          deferral_fee_amount: deferralFee.amount,
          deferral_count: row.deferral_count + 1,
          currency: row.currency,
        },
      },
      { transaction: t },
    );

    return { course: row, change: created };
  });

  // Outside the transaction, deliberately. recordManualPayment does its own S3
  // uploads and its own transaction; failing here leaves a valid deferral with
  // an uncollected fee, which is recoverable, rather than rolling back a move
  // that already happened.
  if (deferralFee.amount > 0 && deferralFee.collectNow) {
    try {
      const { recordManualPayment } = require("./payment.service");
      const payment = await recordManualPayment({
        leadProfileId: course.lead_profile_id,
        userId: user.id,
        amount: deferralFee.amount,
        source: deferralFee.source,
        reference: deferralFee.reference,
        note: deferralFee.note,
        description: `Deferral fee — ${course.program_name}`,
        leadCourseId: course.id,
        paidAt: deferralFee.paidAt,
        purpose: PAYMENT_PURPOSE.DEFERRAL_FEE,
        files: deferralFee.files,
      });
      await change.update({ deferral_payment_id: payment.id });
    } catch (err) {
      console.error(
        `[deferral] could not record the fee payment for enrollment ${course.id}:`,
        err.message,
      );
    }
  }

  return course;
}

/**
 * The recorded cohort moves for one enrollment, newest first.
 */
async function listCohortHistory({ user, leadCourseId }) {
  await assertLeadCourseInScope(user, leadCourseId);

  const rows = await EnrollmentCohortChange.findAll({
    where: { lead_course_id: leadCourseId },
    include: [
      { model: User, as: "ChangedBy", attributes: ["id", "name", "role"] },
      {
        model: Payment,
        as: "DeferralPayment",
        attributes: ["id", "amount", "currency", "status", "verification_status", "paid_at"],
      },
    ],
    order: [["created_at", "DESC"]],
  });

  return rows.map((r) => {
    const plain = r.toJSON();
    return {
      id: plain.id,
      from_cohort_id: plain.from_cohort_id,
      from_cohort_name: plain.from_cohort_name,
      to_cohort_id: plain.to_cohort_id,
      to_cohort_name: plain.to_cohort_name,
      reason: plain.reason,
      effective_at: plain.effective_at,
      created_at: plain.created_at || plain.createdAt,
      deferral_fee_amount: Number(plain.deferral_fee_amount || 0),
      changed_by: plain.ChangedBy
        ? { id: plain.ChangedBy.id, name: plain.ChangedBy.name, role: plain.ChangedBy.role }
        : null,
      fee_payment: plain.DeferralPayment
        ? {
            id: plain.DeferralPayment.id,
            amount: Number(plain.DeferralPayment.amount || 0),
            currency: plain.DeferralPayment.currency,
            status: plain.DeferralPayment.status,
            verification_status: plain.DeferralPayment.verification_status,
            paid_at: plain.DeferralPayment.paid_at,
          }
        : null,
    };
  });
}

/* -------------------------------------------------------------------------
 * Drop-out / reinstate
 *
 * A drop only ever writes to lead_courses. It never touches a payments row —
 * which is precisely why revenue, conversions and closed months are immune to
 * it. Money already received stays exactly where it is, credited to the same
 * agent, in the same month. What stops counting is the UNPAID balance.
 * ---------------------------------------------------------------------- */

const httpError = (statusCode, message, code, extra) =>
  Object.assign(new Error(message), { statusCode, code, ...extra });

/**
 * Resolve the effective drop date. Defaults to now; a caller-supplied date is
 * honoured so a drop recorded in August for someone who left in July stops
 * counting from July. Bounded to [enrolled_at, now] — a drop can neither
 * predate the enrollment nor be scheduled into the future.
 */
function resolveDropDate(droppedAt, enrolledAt) {
  return resolveEffectiveDate(droppedAt, enrolledAt, {
    label: "Drop date",
    code: "INVALID_DROP_DATE",
  });
}

function validateReason(reason, min = DROP_REASON_MIN, max = DROP_REASON_MAX) {
  const trimmed = String(reason || "").trim();
  if (trimmed.length < min) {
    throw httpError(
      400,
      `Reason must be at least ${min} characters`,
      "INVALID_REASON",
    );
  }
  return trimmed.slice(0, max);
}

/**
 * Cancel any open gateway payment link on an enrollment, so a stale URL can't
 * take money after the student has left.
 *
 * Deliberately runs OUTSIDE the drop transaction and never throws: these are
 * calls to Razorpay/Cashfree, and a provider outage must not roll back a drop
 * that is otherwise valid. A link that survives is a nuisance, not a
 * correctness problem — validatePaymentTarget refuses payment on a dropped
 * enrollment regardless.
 */
async function cancelOpenLinksForCourse(leadCourseId) {
  // Required lazily: payment.service requires this module, so a top-level
  // require would be a cycle.
  const { cancelPaymentLink } = require("./payment.service");

  const pending = await Payment.findAll({
    where: { lead_course_id: leadCourseId, status: PAYMENT_STATUS.PENDING },
    include: [{ model: PaymentLink, as: "Link", required: true }],
    attributes: ["id"],
  });

  for (const p of pending) {
    try {
      await cancelPaymentLink(p.id);
    } catch (err) {
      console.error(
        `[drop] could not cancel payment link for payment ${p.id}:`,
        err.message,
      );
    }
  }
}

/**
 * Mark an enrollment as dropped. Superadmin / ProgramManager only (enforced at
 * the route); scope-checked here so an out-of-scope id can't be dropped by
 * guessing it.
 *
 * Refuses (409 PENDING_VERIFICATION) while any payment on the enrollment is
 * awaiting approval. Verifying money into an enrollment that no longer exists
 * would leave a paid payment on a dead row, so the queue must be resolved —
 * verified or rejected — before the drop.
 */
async function dropEnrollment({ user, leadCourseId, reason, droppedAt }) {
  const drop_reason = validateReason(reason);
  await assertLeadCourseInScope(user, leadCourseId);

  const course = await sequelize.transaction(async (t) => {
    const row = await LeadCourse.findByPk(leadCourseId, {
      include: [
        {
          model: Payment,
          as: "Payments",
          attributes: ["id", "amount", "status", "verification_status"],
        },
        { model: Invoice, as: "Invoice", attributes: ["id", "invoice_number"] },
      ],
      transaction: t,
      // Lock the enrollment row only. A bare LOCK.UPDATE would also target the
      // LEFT-joined Payments/Invoice, and Postgres rejects FOR UPDATE on the
      // nullable side of an outer join.
      lock: { level: t.LOCK.UPDATE, of: LeadCourse },
    });

    if (!row) throw httpError(404, "Enrollment not found", "NOT_FOUND");

    if (row.status === ENROLLMENT_STATUS.DROPPED) {
      throw httpError(
        409,
        "This enrollment is already dropped",
        "ALREADY_DROPPED",
      );
    }

    const payments = row.Payments || [];

    const awaiting = payments.filter(
      (p) => p.verification_status === VERIFICATION_STATUS.PENDING,
    );
    if (awaiting.length > 0) {
      const amount = awaiting.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      throw httpError(
        409,
        `${awaiting.length} payment(s) totalling ${formatMoney(amount, row.currency)} are awaiting verification. Verify or reject them before dropping this enrollment.`,
        "PENDING_VERIFICATION",
        { pendingCount: awaiting.length, pendingAmount: amount },
      );
    }

    const totalPaid = payments
      .filter((p) => p.status === PAYMENT_STATUS.PAID)
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    // What the student will never pay. Reported as forfeited_amount rather
    // than due_amount so it stays visible without inflating Outstanding.
    const forfeited = Math.max(0, Number(row.final_fee) - totalPaid);

    const dropped_at = resolveDropDate(droppedAt, row.created_at);

    await row.update(
      {
        status: ENROLLMENT_STATUS.DROPPED,
        dropped_at,
        dropped_by: user.id,
        drop_reason,
      },
      { transaction: t },
    );

    await Activity.create(
      {
        lead_id: null,
        profile_id: row.lead_profile_id,
        actor_id: user.id,
        type: "Audit",
        title: `Enrollment dropped — ${row.program_name}`,
        details: drop_reason,
        metadata: {
          action: "enrollment_dropped",
          lead_course_id: row.id,
          course_id: row.course_id,
          program_name: row.program_name,
          cohort_name: row.cohort_name || null,
          dropped_at,
          currency: row.currency,
          final_fee: Number(row.final_fee),
          total_paid_at_drop: totalPaid,
          forfeited_amount: forfeited,
          was_reenrollment: row.is_reenrollment,
          invoice_number: row.Invoice ? row.Invoice.invoice_number : null,
        },
      },
      { transaction: t },
    );

    return row;
  });

  await cancelOpenLinksForCourse(course.id);

  return course;
}

/**
 * Undo a drop. This means "the drop was a mistake" — the same row, same date,
 * same fee, payments intact. A student who genuinely returned should be
 * re-enrolled instead (new row, new date, current pricing).
 *
 * Refuses when an active enrollment for the same profile+course already exists:
 * without that check, drop -> re-enroll -> reinstate-the-old-row would produce
 * two live enrollments for one course. The partial unique index rejects that
 * too, but catching it here gives a clean error instead of a constraint
 * violation — and a later re-enrollment is itself proof the drop was not a
 * mistake.
 *
 * Payment links cancelled at drop time are NOT resurrected; generate a new one.
 */
async function reinstateEnrollment({ user, leadCourseId, reason }) {
  const trimmedReason = validateReason(reason);
  await assertLeadCourseInScope(user, leadCourseId);

  return sequelize.transaction(async (t) => {
    const row = await LeadCourse.findByPk(leadCourseId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!row) throw httpError(404, "Enrollment not found", "NOT_FOUND");

    if (row.status !== ENROLLMENT_STATUS.DROPPED) {
      throw httpError(409, "This enrollment is not dropped", "NOT_DROPPED");
    }

    // Only the LATEST enrollment for this profile+course may be reinstated.
    //
    // Reinstate means "that drop was a mistake". A later enrollment existing at
    // all is proof it wasn't: someone deliberately re-enrolled this student
    // afterwards. Without this, once every generation is dropped you could
    // resurrect any of them — putting the student back on a two-cycles-old row,
    // at that cycle's price, credited to the agent who lost them twice over.
    //
    // Ordered by created_at (the enrollment date) because that is what "last"
    // means to a user. Re-enrollments can't be back-dated — reEnrollCourse
    // always stamps now() — so a re-enrollment always sorts last. `id` breaks
    // ties so the choice is deterministic.
    const latest = await LeadCourse.findOne({
      where: {
        lead_profile_id: row.lead_profile_id,
        course_id: row.course_id,
      },
      attributes: ["id", "status"],
      order: [
        ["created_at", "DESC"],
        ["id", "DESC"],
      ],
      transaction: t,
    });

    if (latest && latest.id !== row.id) {
      // An active newer row is the more specific complaint, and the more
      // actionable one — telling them to "reinstate the latest instead" would
      // be wrong advice when the latest is already live.
      if (latest.status === ENROLLMENT_STATUS.ACTIVE) {
        throw httpError(
          409,
          "This profile already has an active enrollment in this course. Reinstating would create a duplicate.",
          "ALREADY_ACTIVE",
          { activeLeadCourseId: latest.id },
        );
      }
      throw httpError(
        409,
        "This is not the most recent enrollment for this course. Only the latest one can be reinstated — reinstate that, or re-enroll the student.",
        "SUPERSEDED",
        { latestLeadCourseId: latest.id },
      );
    }

    const previous = {
      dropped_at: row.dropped_at,
      dropped_by: row.dropped_by,
      drop_reason: row.drop_reason,
    };

    // The columns describe the CURRENT drop, not a history — the history is
    // the activity trail, which keeps the original reason and date.
    await row.update(
      {
        status: ENROLLMENT_STATUS.ACTIVE,
        dropped_at: null,
        dropped_by: null,
        drop_reason: null,
      },
      { transaction: t },
    );

    await Activity.create(
      {
        lead_id: null,
        profile_id: row.lead_profile_id,
        actor_id: user.id,
        type: "Audit",
        title: `Enrollment reinstated — ${row.program_name}`,
        details: trimmedReason,
        metadata: {
          action: "enrollment_reinstated",
          lead_course_id: row.id,
          course_id: row.course_id,
          program_name: row.program_name,
          cohort_name: row.cohort_name || null,
          previous_dropped_at: previous.dropped_at,
          previous_dropped_by: previous.dropped_by,
          previous_drop_reason: previous.drop_reason,
        },
      },
      { transaction: t },
    );

    return row;
  });
}

module.exports = {
  enrollCourse,
  reEnrollCourse,
  getProfileCourses,
  updateAgentDiscount,
  changeEnrollmentCohort,
  listCohortHistory,
  listEnrollments,
  listEnrollmentCourses,
  dropEnrollment,
  reinstateEnrollment,
};
