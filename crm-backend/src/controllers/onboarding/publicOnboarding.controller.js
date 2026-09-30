const { LeadProfile } = require("../../models");
const service = require("../../services/onboardingPortal.service");
const {
  HEARD_ABOUT_OPTIONS,
  CAREER_STATUS_LABELS,
  GENDER_OPTIONS,
  TARGET_ROLE_OPTIONS,
  LIMITS,
  ERROR_CODE,
  NOT_ELIGIBLE_MESSAGE,
} = require("../../config/constants/onboarding");

/**
 * The public, unauthenticated half of the onboarding portal.
 *
 * Nothing in here reads req.user — there is no user. Identity comes from the
 * OTP challenge (start/verify/resend) or from the session token that
 * onboardingSession.middleware puts on req.onboarding (me/submit).
 */

/**
 * Turn an OnboardingError into its HTTP shape, and anything else into a 500
 * that says nothing.
 *
 * NOT_ELIGIBLE is rewritten to one fixed sentence here so that "no such
 * profile", "no active enrollment", "dropped enrollment" and "ambiguous phone
 * match" are indistinguishable to the caller — the service already returns the
 * same code for all four; this makes the body identical too.
 */
const fail = (res, err, context) => {
  if (err?.name === "OnboardingError") {
    const body = {
      success: false,
      code: err.code,
      message:
        err.code === ERROR_CODE.NOT_ELIGIBLE
          ? NOT_ELIGIBLE_MESSAGE
          : err.message,
      ...err.meta,
    };
    return res.status(err.status || 400).json(body);
  }

  console.error(`[onboarding] ${context} failed:`, err);
  return res.status(500).json({
    success: false,
    message: "Something went wrong at our end. Please try again.",
  });
};

/**
 * POST /start — { country_code, phone }
 *
 * Resolves the number, checks for an active enrollment, and only then spends a
 * WhatsApp template message on it.
 */
const start = async (req, res) => {
  try {
    const { country_code, phone } = req.body || {};

    if (!phone) {
      return res.status(400).json({
        success: false,
        code: ERROR_CODE.INVALID_PHONE,
        message: "Please enter your phone number.",
      });
    }

    const result = await service.startChallenge({
      countryCode: country_code || "+91",
      phone,
    });

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return fail(res, err, "start");
  }
};

/** POST /verify — { otpToken, otp } */
const verify = async (req, res) => {
  try {
    const { otpToken, otp } = req.body || {};

    if (!otpToken || !otp) {
      return res.status(400).json({
        success: false,
        code: ERROR_CODE.OTP_INVALID,
        message: "Please enter the code we sent you.",
      });
    }

    const result = await service.verifyChallenge({ otpToken, otp });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return fail(res, err, "verify");
  }
};

/** POST /resend — { otpToken } */
const resend = async (req, res) => {
  try {
    const { otpToken } = req.body || {};

    if (!otpToken) {
      return res.status(400).json({
        success: false,
        code: ERROR_CODE.OTP_EXPIRED,
        message: "Please start again.",
      });
    }

    const result = await service.resendChallenge({ otpToken });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return fail(res, err, "resend");
  }
};

/**
 * GET /me — identity, enrollments, prefill and the form's option lists.
 *
 * One call so the form can render fully on first paint. The profile id comes
 * from the session token, never from the request.
 */
const me = async (req, res) => {
  try {
    const { leadProfileId } = req.onboarding;

    const profile = await LeadProfile.findByPk(leadProfileId, {
      attributes: ["id", "name", "phone", "country_code", "email"],
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        code: ERROR_CODE.NOT_ELIGIBLE,
        message: NOT_ELIGIBLE_MESSAGE,
      });
    }

    const [enrollments, details] = await Promise.all([
      service.getActiveEnrollments(leadProfileId),
      service.getDetails(leadProfileId),
    ]);

    // A drop processed while the session was open ends it here rather than at
    // submit time, so they don't fill in a form that will be refused.
    if (enrollments.length === 0) {
      return res.status(404).json({
        success: false,
        code: ERROR_CODE.NOT_ELIGIBLE,
        message: NOT_ELIGIBLE_MESSAGE,
      });
    }

    return res.status(200).json({
      success: true,
      name: profile.name,
      // Masked, not full. They already know their own number, so masking costs
      // them nothing and a shoulder-surfed screen discloses nothing new.
      phoneMasked: service.maskPhone(
        String(profile.country_code || "+91").replace(/\D/g, ""),
        String(profile.phone || "").replace(/\D/g, ""),
      ),
      // Shown beside the phone so they can judge whether to give us an
      // alternate. Null when we hold no email — the portal says "not on file".
      emailMasked: service.maskEmail(profile.email),
      enrollments: enrollments.map((e) => ({
        programName: e.program_name,
        cohortName: e.cohort_name || null,
      })),
      prefill: details ? toPrefill(details) : null,
      submissionCount: details?.submission_count || 0,
      completionPercent: service.completionPercent(details),
      options: {
        heardAbout: HEARD_ABOUT_OPTIONS,
        careerStatus: Object.entries(CAREER_STATUS_LABELS).map(
          ([value, label]) => ({ value, label }),
        ),
        gender: GENDER_OPTIONS,
        targetRoles: TARGET_ROLE_OPTIONS,
      },
      limits: LIMITS,
    });
  } catch (err) {
    return fail(res, err, "me");
  }
};

/** Only the answer fields — never the provenance columns. */
const toPrefill = (d) => ({
  age: d.age,
  gender: d.gender,
  currentCity: d.current_city,
  careerStatus: d.career_status,
  careerStatusOther: d.career_status_other,
  orgName: d.org_name,
  fieldOfStudy: d.field_of_study,
  roleDescription: d.role_description,
  totalExperienceYears: d.total_experience_years,
  aboutStudiesJob: d.about_studies_job,
  hobbies: d.hobbies,
  linkedinUrl: d.linkedin_url,
  resumeUrl: d.resume_url,
  targetRoles: d.target_roles || [],
  targetRoleOther: d.target_role_other,
  heardAboutUs: d.heard_about_us,
  heardAboutUsOther: d.heard_about_us_other,
  secondaryEmail: d.secondary_email,
  secondaryPhone: d.secondary_phone,
  secondaryCountryCode: d.secondary_country_code,
});

/** POST /profile — the form itself. */
const submit = async (req, res) => {
  try {
    const { leadProfileId } = req.onboarding;

    const result = await service.submitDetails({
      leadProfileId,
      payload: req.body || {},
      // trust proxy is set in index.js, so req.ip is the client, not the LB.
      ip: req.ip,
      userAgent: req.get("user-agent"),
    });

    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return fail(res, err, "submit");
  }
};

module.exports = { start, verify, resend, me, submit };
