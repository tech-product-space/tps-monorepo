const paymentListService = require("../../services/paymentList.service");
const { canVerifyPayments, canExportLeads } = require("../../config/constants/roles");
const {
  formatDateTimeForExport,
  csvEscape,
  csvText,
} = require("../../utils/csv");

/** Normalize `?agentId=a&agentId=b` and `?agentId=a,b` into an array. */
function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((v) => String(v).split(","));
  return String(value).split(",");
}

function readFilters(query) {
  return {
    view: query.view,
    agentIds: toArray(query.agentId).map((s) => s.trim()).filter(Boolean),
    cohortIds: toArray(query.cohortId).map((s) => s.trim()).filter(Boolean),
    courseId: query.courseId,
    currency: query.currency,
    q: query.q,
    source: query.source,
    dateField: query.dateField,
    from: query.from,
    to: query.to,
    minAmount: query.minAmount,
    maxAmount: query.maxAmount,
    sort: query.sort,
    dir: query.dir,
  };
}

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
    const result = await paymentListService.listPayments({
      user: req.user,
      filters: readFilters(req.query),
      query: req.query,
    });

    res.json({
      success: true,
      ...result,
      // Drives whether the client renders Verify/Reject at all. The routes
      // enforce it regardless; this only saves showing a button that 403s.
      canVerify: canVerifyPayments(req.user.role),
    });
  } catch (error) {
    sendError(res, error, "Failed to load payments");
  }
};

/* ─── CSV export ─────────────────────────────────────────────────────────── */

const EXPORT_HEADERS = [
  "Paid On",
  "Recorded On",
  "Lead",
  "Phone",
  "Programme",
  "Cohort",
  "Amount",
  "Currency",
  "Amount (INR)",
  "Source",
  "Reference",
  "Status",
  "Verification",
  "Recorded By",
  "Verified By",
  "Verified At",
  "Rejection Reason",
  "Description",
];

function toRow(p) {
  const phone = p.profile?.phone
    ? `${p.profile.country_code || ""} ${p.profile.phone}`.trim()
    : "";

  return [
    csvEscape(formatDateTimeForExport(p.paid_at)),
    csvEscape(formatDateTimeForExport(p.created_at)),
    csvEscape(p.profile?.name),
    // Pinned as text — "+91 98765…" is a formula to Excel. See utils/csv.js.
    csvText(phone),
    csvEscape(p.course?.program_name),
    csvEscape(p.cohort_name),
    csvEscape(p.amount),
    csvEscape(p.currency),
    csvEscape(p.base_amount),
    csvEscape(p.source),
    // Gateway references are long alphanumerics that Excel occasionally
    // reinterprets; the reference has to survive verbatim to be searchable.
    csvText(p.reference),
    csvEscape(p.status),
    csvEscape(p.verification_status),
    csvEscape(p.creator?.name),
    csvEscape(p.verified_by_name),
    csvEscape(formatDateTimeForExport(p.verified_at)),
    csvEscape(p.rejection_reason),
    csvEscape(p.description),
  ];
}

exports.exportCsv = async (req, res) => {
  try {
    // Belt and braces: the route is role-gated too. Payment data with lead
    // names and amounts is the most sensitive extract in the app.
    if (!canExportLeads(req.user.role)) {
      return res.status(403).json({ success: false, message: "Not permitted to export." });
    }

    const { rows, truncated } = await paymentListService.listPaymentsForExport({
      user: req.user,
      filters: readFilters(req.query),
    });

    const csv = [EXPORT_HEADERS.join(","), ...rows.map((r) => toRow(r).join(","))].join("\n");

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=tps-crm-payments_${date}.csv`);
    if (truncated) {
      // Surfaced as a header so the client can warn rather than silently
      // handing over a partial extract.
      res.setHeader("X-Export-Truncated", String(paymentListService.EXPORT_LIMIT));
    }
    res.send(csv);
  } catch (error) {
    sendError(res, error, "Failed to export payments");
  }
};
