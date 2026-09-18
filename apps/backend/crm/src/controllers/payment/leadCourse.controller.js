const leadCourseService = require("../../services/leadCourse.service");
const { assertProfileInScope } = require("../../utils/documentScope");
const {
  sendOnboardingByLeadCourseId,
} = require("../../services/emailTemplate.service");

exports.enrollCourse = async (req, res) => {
  try {
    const {
      profileId,
      courseId,
      programName,
      coursePrice,
      platformDiscountPercent,
      agentDiscountAmount,
      cohortId,
      currency,
      enrolledAt,
      gstInclusive,
    } = req.body;

    if (!profileId || !courseId || !programName || !coursePrice) {
      return res.status(400).json({
        success: false,
        message:
          "profileId, courseId, programName, and coursePrice are required",
      });
    }

    // Optional custom enrolled date (backdating). Ignore invalid values.
    let enrolledAtDate = null;
    if (enrolledAt) {
      const parsed = new Date(enrolledAt);
      if (!Number.isNaN(parsed.getTime())) enrolledAtDate = parsed;
    }

    const leadCourse = await leadCourseService.enrollCourse({
      profileId,
      userId: req.user.id,
      courseId,
      programName,
      coursePrice: Number(coursePrice),
      platformDiscountPercent: Number(platformDiscountPercent) || 0,
      agentDiscountAmount: Number(agentDiscountAmount) || 0,
      cohortId: cohortId || null,
      currency: currency || "INR",
      enrolledAt: enrolledAtDate,
      // Only forward a real boolean; anything else lets the service apply the
      // course's default GST mode.
      gstInclusive:
        typeof gstInclusive === "boolean" ? gstInclusive : undefined,
    });

    // No onboarding email here. Onboarding follows the first payment, not the
    // enrollment — a brand-new enrollment has no money against it by definition,
    // so an opt-in send at this point would bypass that gate entirely.
    res.status(201).json({
      success: true,
      data: leadCourse,
    });
  } catch (error) {
    console.error("Enroll course error:", error);

    const status = error.message?.includes("already enrolled") ? 409 : 500;

    res.status(status).json({
      success: false,
      message: error.message || "Failed to enroll in course",
    });
  }
};

exports.getProfileCourses = async (req, res) => {
  try {
    const { profileId } = req.params;

    // Same guard as the profile's payment list — this returns fees and dues for
    // every enrollment on the lead, so leaving it open would undo that fix.
    await assertProfileInScope(req.user, profileId);

    const courses = await leadCourseService.getProfileCourses(profileId);

    res.json({
      success: true,
      data: courses,
    });
  } catch (error) {
    const status = error.statusCode || 500;
    if (status >= 500) console.error("Get profile courses error:", error);

    res.status(status).json({
      success: false,
      message: status >= 500 ? "Failed to fetch enrolled courses" : error.message,
    });
  }
};

// Manual send-after-enrollment of the course onboarding email.
exports.sendOnboarding = async (req, res) => {
  try {
    const { leadCourseId } = req.params;
    const { name, email } = req.body;

    const result = await sendOnboardingByLeadCourseId({
      leadCourseId,
      name,
      email,
      actorId: req.user?.id || null,
    });

    res.json({ success: true, ...result });
  } catch (error) {
    // An explicit statusCode wins — that's a deliberate precondition failure
    // (e.g. 409 "no payment yet"), not something to re-derive from the message.
    const status =
      error.statusCode ||
      (error.message?.includes("not found")
        ? 404
        : error.message?.includes("No onboarding template") ||
            error.message?.includes("No recipient")
          ? 400
          : 500);
    if (status >= 500) console.error("Send onboarding error:", error);
    res.status(status).json({
      success: false,
      message: error.message || "Failed to send onboarding email",
    });
  }
};

exports.listEnrollments = async (req, res) => {
  try {
    // Query values may arrive as a single string or an array (extended query
    // parser). Normalise the multi-value filters to arrays.
    const toArray = (v) =>
      v == null || v === "" ? [] : Array.isArray(v) ? v : [v];

    const rows = await leadCourseService.listEnrollments({
      user: req.user,
      filters: {
        from: req.query.from || null,
        to: req.query.to || null,
        paymentFrom: req.query.payment_from || null,
        paymentTo: req.query.payment_to || null,
        courseId: req.query.course_id || null,
        cohortIds: toArray(req.query.cohort_id),
        // "Who did this batch recruit" — still counts a student who has since
        // been deferred out of it. Distinct from cohort_id, which is where the
        // student is now.
        originalCohortIds: toArray(req.query.original_cohort_id),
        agentIds: toArray(req.query.agent_id),
        paymentStatus: req.query.payment_status || null,
        agentState: req.query.agent_state || null,
        // Lifecycle view: active | dropped | all. Omitted defaults to active
        // (or all, on a revenue drill-through) — see listEnrollments.
        status: req.query.status || null,
      },
    });
    res.json({ rows });
  } catch (error) {
    console.error("List enrollments error:", error);
    res.status(500).json({ error: "Failed to load enrollments" });
  }
};

exports.listEnrollmentCourses = async (req, res) => {
  try {
    const rows = await leadCourseService.listEnrollmentCourses({ user: req.user });
    res.json({ rows });
  } catch (error) {
    console.error("List enrollment courses error:", error);
    res.status(500).json({ error: "Failed to load courses" });
  }
};

/**
 * Move an enrollment to another cohort, recording it as a deferral.
 *
 * Accepts multipart (proof files for the optional fee), so every scalar may
 * arrive as a string — the fee fields are coerced here rather than in the
 * service, which deals in numbers.
 */
exports.changeEnrollmentCohort = async (req, res) => {
  try {
    const { toCohortId, reason, effectiveAt } = req.body;

    // Multipart sends the fee as flat `fee[...]` keys or as a JSON blob,
    // depending on the client; JSON requests send a plain object.
    const rawFee =
      typeof req.body.fee === "string" ? JSON.parse(req.body.fee || "{}") : req.body.fee;

    const fee =
      rawFee && rawFee.amount
        ? {
            amount: Number(rawFee.amount),
            collectNow:
              rawFee.collectNow === true || rawFee.collectNow === "true",
            source: rawFee.source,
            reference: rawFee.reference || null,
            note: rawFee.note || null,
            paidAt: rawFee.paidAt || null,
            files: req.files || [],
          }
        : null;

    const updated = await leadCourseService.changeEnrollmentCohort({
      user: req.user,
      leadCourseId: req.params.id,
      toCohortId,
      reason,
      effectiveAt: effectiveAt || null,
      fee,
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    sendLifecycleError(res, error, "Failed to change cohort");
  }
};

exports.listCohortHistory = async (req, res) => {
  try {
    const rows = await leadCourseService.listCohortHistory({
      user: req.user,
      leadCourseId: req.params.id,
    });
    res.json({ rows });
  } catch (error) {
    sendLifecycleError(res, error, "Failed to load cohort history");
  }
};

/**
 * Shared error shape for the lifecycle endpoints.
 *
 * The service throws Object.assign(new Error(msg), { statusCode, code }), and
 * the machine-readable `code` is what the UI keys on — PENDING_VERIFICATION in
 * particular drives an inline error linking to the verification queue rather
 * than a generic toast. Anything without a statusCode is a genuine 500.
 */
const sendLifecycleError = (res, error, fallback) => {
  const status = error.statusCode || 500;
  if (status >= 500) console.error(`${fallback}:`, error);
  res.status(status).json({
    success: false,
    message: error.message || fallback,
    code: error.code || null,
    ...(error.pendingCount !== undefined && {
      pendingCount: error.pendingCount,
      pendingAmount: error.pendingAmount,
    }),
    ...(error.activeLeadCourseId !== undefined && {
      activeLeadCourseId: error.activeLeadCourseId,
    }),
    // Which enrollment the caller should have acted on instead (SUPERSEDED).
    ...(error.latestLeadCourseId !== undefined && {
      latestLeadCourseId: error.latestLeadCourseId,
    }),
  });
};

exports.dropEnrollment = async (req, res) => {
  try {
    const { reason, droppedAt } = req.body;
    const updated = await leadCourseService.dropEnrollment({
      user: req.user,
      leadCourseId: req.params.id,
      reason,
      droppedAt: droppedAt || null,
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    sendLifecycleError(res, error, "Failed to drop enrollment");
  }
};

/**
 * Re-enroll a dropped student. `:id` is the DROPPED enrollment being restarted
 * from — the course is read off it, so the request can only set price, cohort
 * and currency. There is deliberately no owner field: ownership is resolved
 * from the lead, exactly as on a first-time enrollment.
 */
exports.reEnrollCourse = async (req, res) => {
  try {
    const {
      coursePrice,
      platformDiscountPercent,
      agentDiscountAmount,
      cohortId,
      currency,
      gstInclusive,
    } = req.body;

    const leadCourse = await leadCourseService.reEnrollCourse({
      user: req.user,
      sourceLeadCourseId: req.params.id,
      coursePrice,
      platformDiscountPercent,
      agentDiscountAmount,
      cohortId: cohortId || null,
      currency: currency || null,
      gstInclusive:
        typeof gstInclusive === "boolean" ? gstInclusive : undefined,
    });

    res.status(201).json({ success: true, data: leadCourse });
  } catch (error) {
    sendLifecycleError(res, error, "Failed to re-enroll");
  }
};

exports.reinstateEnrollment = async (req, res) => {
  try {
    const { reason } = req.body;
    const updated = await leadCourseService.reinstateEnrollment({
      user: req.user,
      leadCourseId: req.params.id,
      reason,
    });
    res.json({ success: true, data: updated });
  } catch (error) {
    sendLifecycleError(res, error, "Failed to reinstate enrollment");
  }
};

exports.updateAgentDiscount = async (req, res) => {
  try {
    const { leadCourseId, agentDiscountAmount } = req.body;

    if (!leadCourseId) {
      return res.status(400).json({
        success: false,
        message: "leadCourseId is required",
      });
    }

    const updated = await leadCourseService.updateAgentDiscount({
      leadCourseId,
      agentDiscountAmount: Number(agentDiscountAmount) || 0,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    // An explicit statusCode wins, so 409 ENROLLMENT_DROPPED
    // survives instead of being flattened to a 500.
    const status = error.statusCode || (error.message?.includes("not found") ? 404 : 500);
    if (status >= 500) console.error("Update agent discount error:", error);

    res.status(status).json({
      success: false,
      message: error.message || "Failed to update agent discount",
      code: error.code || null,
    });
  }
};

