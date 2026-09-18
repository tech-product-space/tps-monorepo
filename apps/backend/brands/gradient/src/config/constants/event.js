/**
 * What kind of session it is.
 *
 * Shared with `Recordings.format`, which offers the same three values — a
 * recording's badge says "Workshop" for the same reason an event does. Keeping
 * one list means adding a fourth type cannot leave the two disagreeing about
 * what a session can be.
 */
export const EVENT_TYPES = Object.freeze(["Teardown", "Hackathon", "Workshop"]);

export const EVENT_EMAIL_TEMPLATE_TYPE = Object.freeze({
  APPROVED: "Approved",
  WAITLISTED: "Waitlisted",
  DECLINED: "Declined",
  REGISTERED: "Registered",
  // Sent with the certificate. Reuses EventEmailTemplates rather than getting
  // its own table — the certificate template holds the design, not the email.
  CERTIFICATE: "Certificate",
});

// Event types whose feedback form describes a TEAM's project rather than one
// person's experience. These are the types that have teammate fields, so they
// are the ones that issue certificates to people who never registered and that
// need the one-submission-per-team guard.
export const TEAM_EVENT_TYPES = Object.freeze(["Hackathon", "Teardown"]);

// Per-event switches for the feedback + certificate flow, all on by default.
// Stored in Events.settings (JSONB) and read through resolveEventSettings() —
// never off the model directly, or a row saved before a key existed behaves as
// though that key were false.
export const EVENT_SETTINGS_DEFAULTS = Object.freeze({
  // Render and email the certificate the moment feedback is submitted, instead
  // of parking it for an admin to approve.
  autoIssueCertificate: true,
  // An email that is not on the guest list opens the registration dialog rather
  // than a dead end. Only ever reachable while canAcceptResponse is on.
  allowSelfRegistrationOnFeedback: true,
  // A Waitlisted guest who submits feedback is promoted to Approved. Without
  // this, a stranger self-registering is treated better than someone who
  // actually signed up.
  promoteWaitlistedOnFeedback: true,
  // Push self-registrations to the shared Product Space CRM, best-effort.
  createCrmLeadOnFeedbackRegistration: true,
});