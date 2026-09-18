const service = require("../../services/profileSubmissions.service");
const { Activity } = require("../../models");
const { canViewOnboardingDetails } = require("../../config/constants/roles");
const {
  csvEscape,
  csvText,
  buildCsv,
  formatDateTimeForExport,
} = require("../../utils/csv");

/**
 * The Student Profiles screen. See PROFILE_SUBMISSIONS_PLAN.md.
 *
 * The router role-gates every handler; the belt-and-braces check inside
 * `exportCsv` is there because that one produces a file that leaves the
 * building.
 */

function sendError(res, error, fallback) {
  const status = error.statusCode || 500;
  if (status >= 500) console.error(`${fallback}:`, error);
  return res.status(status).json({
    success: false,
    message: status >= 500 ? fallback : error.message,
  });
}

exports.list = async (req, res) => {
  try {
    const result = await service.listSubmissions({ query: req.query });
    res.json({ success: true, ...result });
  } catch (error) {
    sendError(res, error, "Failed to load student profiles");
  }
};

exports.filters = async (req, res) => {
  try {
    const data = await service.getFilterOptions();
    res.json({ success: true, ...data });
  } catch (error) {
    sendError(res, error, "Failed to load filter options");
  }
};

/* ─── CSV ──────────────────────────────────────────────────────────────────── */

const SUBMITTED_HEADERS = [
  "Name",
  "Phone",
  "Email",
  "Programmes",
  "Cohorts",
  "Age",
  "Gender",
  "City",
  "Career Status",
  "Organisation",
  "Field of Study",
  // Neutral on purpose: one column carries the current role for someone
  // working and the previous role for someone on a break, and the Career
  // Status column immediately to its left says which.
  "Role",
  "Experience (Years)",
  "About Studies / Job",
  "Target Roles",
  "LinkedIn",
  "Resume",
  "Heard About Us",
  "Hobbies",
  "Alternate Email",
  "Alternate Phone",
  "Completion %",
  "Submissions",
  "First Submitted",
  "Last Submitted",
];

const PENDING_HEADERS = ["Name", "Phone", "Email", "Programmes", "Cohorts"];

/** "PM Fellowship, Gen AI (dropped)" — the drop is part of the answer. */
const programmeList = (row) =>
  (row.programmes || [])
    .map((p) => `${p.programName}${p.dropped ? " (dropped)" : ""}`)
    .join(", ");

const cohortList = (row) =>
  (row.programmes || [])
    .map((p) => p.cohortName)
    .filter(Boolean)
    .join(", ");

/**
 * "Product Manager, Associate PM" — or with the free text spliced in where
 * "Other" was picked, since a column of its own would be empty for nearly
 * every row.
 */
const targetRoleList = (row) =>
  (row.targetRoleLabels || [])
    .map((label, i) =>
      (row.targetRoles || [])[i] === "other" && row.targetRoleOther
        ? `Other — ${row.targetRoleOther}`
        : label,
    )
    .join(", ");

/** `+91 9876543210`, pinned as text by the caller. */
const fullPhone = (code, number) =>
  number ? `${code || "+91"} ${number}`.trim() : "";

function submittedRow(r) {
  return [
    csvEscape(r.name),
    csvText(fullPhone(r.countryCode, r.phone)),
    csvEscape(r.email),
    csvEscape(programmeList(r)),
    csvEscape(cohortList(r)),
    csvEscape(r.age),
    csvEscape(r.genderLabel),
    csvEscape(r.currentCity),
    csvEscape(
      r.careerStatus === "other" && r.careerStatusOther
        ? `Other — ${r.careerStatusOther}`
        : r.careerStatusLabel,
    ),
    csvEscape(r.orgName),
    csvEscape(r.fieldOfStudy),
    csvEscape(r.roleDescription),
    csvEscape(r.totalExperienceYears),
    csvEscape(r.aboutStudiesJob),
    // "Product Manager, Other — Founder" — the free text rides in the same
    // cell, because a separate column would be blank for almost every row.
    csvEscape(targetRoleList(r)),
    csvEscape(r.linkedinUrl),
    csvEscape(r.resumeUrl),
    csvEscape(
      r.heardAboutUs === "other" && r.heardAboutUsOther
        ? `Other — ${r.heardAboutUsOther}`
        : r.heardAboutUsLabel,
    ),
    csvEscape(r.hobbies),
    csvEscape(r.secondaryEmail),
    csvText(fullPhone(r.secondaryCountryCode, r.secondaryPhone)),
    csvEscape(r.completionPercent),
    csvEscape(r.submissionCount),
    csvEscape(formatDateTimeForExport(r.firstSubmittedAt)),
    csvEscape(formatDateTimeForExport(r.lastSubmittedAt)),
  ];
}

function pendingRow(r) {
  return [
    csvEscape(r.name),
    csvText(fullPhone(r.countryCode, r.phone)),
    csvEscape(r.email),
    csvEscape(programmeList(r)),
    csvEscape(cohortList(r)),
  ];
}

/**
 * Leave a record that this file was produced.
 *
 * Not ceremony. The submitted export carries, for every student: where they
 * live, who they work for, their LinkedIn, their CV, what they do at weekends,
 * and an alternate phone and email — the largest single PII payload this
 * system can emit. Two roles can produce it, and there should be a record of
 * when they did.
 *
 * `Activity.type` is a validated enum on the model
 * ('Note'|'Call'|'StatusChange'|'FollowUp'|'Assignment'|'System'|'Audit'|
 * 'Payment') — 'Audit' is the right one here and a new value would throw.
 * `profile_id` is null because this row belongs to no single student.
 */
async function recordExport({ user, filters, view, rowCount, truncated }) {
  try {
    await Activity.create({
      profile_id: null,
      actor_id: user.id,
      type: "Audit",
      title: `Exported ${rowCount} student profile${rowCount === 1 ? "" : "s"}`,
      details: `CSV export of the "${view}" view from the Student Profiles page.`,
      metadata: { source: "student_profiles_export", view, rowCount, truncated, filters },
    });
  } catch (error) {
    // The file has already been produced by the time this runs. Failing the
    // request now would be worse than a missing audit row — log and move on.
    console.error("Failed to record student-profile export:", error);
  }
}

exports.exportCsv = async (req, res) => {
  try {
    if (!canViewOnboardingDetails(req.user.role)) {
      return res
        .status(403)
        .json({ success: false, message: "Not permitted to export." });
    }

    const { rows, truncated, view } = await service.listForExport({
      query: req.query,
    });

    const isPending = view === service.VIEW.NOT_SUBMITTED;
    const csv = buildCsv(
      isPending ? PENDING_HEADERS : SUBMITTED_HEADERS,
      rows.map(isPending ? pendingRow : submittedRow),
    );

    const date = new Date().toISOString().slice(0, 10);
    const slug = isPending ? "not-submitted" : "student-profiles";

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${slug}_${date}.csv"`);
    if (truncated) {
      // Surfaced as a header so the client warns rather than silently handing
      // over a partial extract that reads as "that's everyone".
      res.setHeader("X-Export-Truncated", String(service.EXPORT_LIMIT));
      console.warn(
        `Student profile export truncated at ${service.EXPORT_LIMIT} rows for user ${req.user.id}`,
      );
    }

    // Excel only honours UTF-8 in a CSV when it finds a BOM; without it, a
    // student who wrote their city in Devanagari comes back as mojibake.
    res.send(`﻿${csv}`);

    await recordExport({
      user: req.user,
      filters: service.readFilters(req.query),
      view,
      rowCount: rows.length,
      truncated,
    });
  } catch (error) {
    sendError(res, error, "Failed to export student profiles");
  }
};
