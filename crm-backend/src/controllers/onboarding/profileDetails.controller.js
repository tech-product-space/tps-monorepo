const { LeadProfile } = require("../../models");
const service = require("../../services/onboardingPortal.service");
const {
  CAREER_STATUS_LABELS,
  GENDER_LABELS,
  TARGET_ROLE_LABELS,
  HEARD_ABOUT_OPTIONS,
} = require("../../config/constants/onboarding");

/**
 * GET /profiles/:id/details — the CRM's read of what a student told us.
 *
 * Superadmin and Program Manager only, enforced by requireRole on the route.
 * These are personal free-text answers — where they live, who they work for,
 * what they do at weekends — not pipeline data, so the sales floor has no
 * business in them.
 *
 * Read-only. Nobody edits this from the CRM; the student owns it and can
 * resubmit at onboarding.theproductspace.in whenever they like.
 */

const HEARD_ABOUT_LABELS = Object.fromEntries(
  HEARD_ABOUT_OPTIONS.map((o) => [o.value, o.label]),
);

const getProfileDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const profile = await LeadProfile.findByPk(id, { attributes: ["id"] });
    if (!profile) {
      return res
        .status(404)
        .json({ success: false, message: "Profile not found" });
    }

    const details = await service.getDetails(id);

    if (!details) {
      return res.status(200).json({
        success: true,
        data: null,
        completion_percent: 0,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...details.toJSON(),
        // Resolved labels so the CRM renders "On a Career Break", not
        // "career_break", without duplicating the map on the frontend.
        career_status_label:
          CAREER_STATUS_LABELS[details.career_status] || details.career_status,
        heard_about_us_label:
          HEARD_ABOUT_LABELS[details.heard_about_us] || details.heard_about_us,
        gender_label: details.gender
          ? GENDER_LABELS[details.gender] || details.gender
          : null,
        // Labels resolved server-side so a value added to the option list shows
        // up correctly in the CRM without a frontend deploy.
        target_role_labels: (details.target_roles || []).map(
          (r) => TARGET_ROLE_LABELS[r] || r,
        ),
      },
      completion_percent: service.completionPercent(details),
    });
  } catch (error) {
    console.error("Get profile details error:", error);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch profile details" });
  }
};

module.exports = { getProfileDetails };
