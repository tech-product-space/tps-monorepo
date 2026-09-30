// The single source of truth for user roles.
//
// Roles are stored as plain strings in users.role (STRING(20), no DB-level
// CHECK), and every comparison in the codebase is an exact, case-sensitive
// match. Import from here rather than writing the literal again — a typo in a
// role string grants nothing and raises no error.
const ROLES = Object.freeze({
  SUPERADMIN: "Superadmin",
  MANAGER: "Manager",
  AGENT: "Agent",
  // Sees and works every lead in the org, and owns the payment/enrollment
  // surface end to end. Has no team and is never a lead owner, so their writes
  // are always on somebody else's lead. Everything outside leads, meetings and
  // the money surface stays closed to them — see the read-only middleware.
  PROGRAM_MANAGER: "ProgramManager",
});

const ALL_ROLES = Object.freeze(Object.values(ROLES));

// Human-facing label. ProgramManager is stored without a space so it stays
// safe in query params and access_grants.principal_id.
const ROLE_LABELS = Object.freeze({
  [ROLES.SUPERADMIN]: "Superadmin",
  [ROLES.MANAGER]: "Manager",
  [ROLES.AGENT]: "Agent",
  [ROLES.PROGRAM_MANAGER]: "Program Manager",
});

// --- Capability predicates -------------------------------------------------
// Prefer these over `role === "Superadmin"` checks. Adding the next role then
// means editing this file, not hunting down comparisons across the codebase.

// Sees every lead / enrollment / invoice in the org, unfiltered by ownership.
const hasGlobalScope = (role) =>
  role === ROLES.SUPERADMIN || role === ROLES.PROGRAM_MANAGER;

// Writes are confined to an explicit allowlist rather than open across the app.
// Enforced centrally by the read-only middleware, not by per-route checks — see
// WRITE_ALLOWLIST there for exactly what the role may mutate.
const hasRestrictedWrites = (role) => role === ROLES.PROGRAM_MANAGER;

// May work the lead pipeline: create a lead, edit its fields, move its status,
// set a follow-up, write and revise notes. Every role qualifies — the Program
// Manager joined them here, and their one remaining exclusion is the bulk
// editor (canBulkEditLeads). Kept as a named seam so a future read-only role
// has one place to be excluded.
const canWriteLeads = (role) => ALL_ROLES.includes(role);

// The multi-select bulk editor — mass status change and reassignment across
// leads at once. Held back from the Program Manager: they work leads one at a
// time, and reassignment is the sales line's call, not the programme's.
const canBulkEditLeads = (role) =>
  canWriteLeads(role) && role !== ROLES.PROGRAM_MANAGER;

// May create/edit payments, enrollments, invoices, receipts and cohorts.
const canManagePayments = (role) => role !== ROLES.AGENT;

// May approve or reject a manually-recorded payment, turning it into money that
// counts. Recording stays open to everyone — this is the control on it.
const canVerifyPayments = (role) =>
  role === ROLES.SUPERADMIN || role === ROLES.PROGRAM_MANAGER;

// May open the verification queue. Managers get read-only visibility of their
// own team's pending payments (useful when chasing collections) but cannot act.
const canViewVerificationQueue = (role) =>
  canVerifyPayments(role) || role === ROLES.MANAGER;

// The commercial/programme side of settings: cohorts, business & invoice
// details, WhatsApp and email templates. Distinct from pipeline settings
// (statuses, products, Facebook ingestion), which stay with the Superadmin.
const canManageProgramSettings = (role) =>
  role === ROLES.SUPERADMIN || role === ROLES.PROGRAM_MANAGER;

// The personal answers a student gave in the onboarding portal — city,
// employer, hobbies, LinkedIn, resume. Not pipeline data: it is collected after
// the sale, for the people who run the programme. Kept as its own predicate
// rather than reusing canManageProgramSettings because the two answer different
// questions and will drift.
const canViewOnboardingDetails = (role) =>
  role === ROLES.SUPERADMIN || role === ROLES.PROGRAM_MANAGER;

// The meetings module — scheduling, rescheduling, cancelling and logging
// outcomes, plus the Google account link that powers it. Open to every role;
// the Program Manager books mentor and onboarding calls of their own. The
// meetings *report* is separate and stays supervisory (routes/report.routes.js).
const canAccessMeetings = (role) => ALL_ROLES.includes(role);

// Bulk CSV extract of the lead pipeline.
const canExportLeads = (role) => role === ROLES.SUPERADMIN;

// May be assigned a lead / be credited an enrollment's owner_agent_id.
// Superadmins and Program Managers are supervisory, never lead owners.
const isAssignableRole = (role) =>
  role === ROLES.AGENT || role === ROLES.MANAGER;

module.exports = {
  ROLES,
  ALL_ROLES,
  ROLE_LABELS,
  hasGlobalScope,
  hasRestrictedWrites,
  canWriteLeads,
  canBulkEditLeads,
  canManagePayments,
  canVerifyPayments,
  canViewVerificationQueue,
  canManageProgramSettings,
  canViewOnboardingDetails,
  canAccessMeetings,
  canExportLeads,
  isAssignableRole,
};
