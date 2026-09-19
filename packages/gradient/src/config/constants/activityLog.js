/**
 * Constants for the admin activity log.
 *
 * `action` is always stored as "<entityType>.<verb>" — e.g. "course.published".
 * The frontend renders the sentence from these parts, so nothing here is a
 * display string; keep labels in the admin panel's `constants/activity.ts`.
 */

export const ACTIVITY_ACTOR_TYPE = {
  ADMIN: "admin",
  SYSTEM: "system",
  USER: "user",
};

export const ACTIVITY_STATUS = {
  SUCCESS: "success",
  FAILURE: "failure",
};

export const ACTIVITY_ENTITY = {
  COURSE: "course",
  FREE_COURSE: "freeCourse",
  FREE_COURSE_MODULE: "freeCourseModule",
  FREE_COURSE_LESSON: "freeCourseLesson",
  EVENT: "event",
  EVENT_GUEST: "eventGuest",
  EVENT_REMINDER: "eventReminder",
  EVENT_FEEDBACK: "eventFeedback",
  EVENT_CERTIFICATE: "eventCertificate",
  FREE_COURSE_CERTIFICATE: "freeCourseCertificate",
  BLOG: "blog",
  RESOURCE: "resource",
  RECORDING: "recording",
  RECORDING_CATEGORY: "recordingCategory",
  PROJECT: "project",
  PROJECT_CATEGORY: "projectCategory",
  PROJECT_STEP: "projectStep",
  PROJECT_EMAIL_TEMPLATE: "projectEmailTemplate",
  LEAD: "lead",
  JOB: "job",
  SUBSCRIBER: "subscriber",
  ADMIN: "admin",
  ADMIN_ROLE: "adminRole",
  CAMPAIGN: "campaign",
  CONTACT_LIST: "contactList",
  WORKFLOW: "workflow",
  META_ACCOUNT: "metaAccount",
  META_FORM: "metaForm",
  META_LEAD: "metaLead",
  META_SOURCE: "metaSource",
  EMAIL_TEMPLATE: "emailTemplate",
  FILE: "file",
};

export const ACTIVITY_VERB = {
  CREATED: "created",
  UPDATED: "updated",
  DELETED: "deleted",
  PUBLISHED: "published",
  UNPUBLISHED: "unpublished",
  REORDERED: "reordered",
  STATUS_CHANGED: "statusChanged",
  BULK_UPDATED: "bulkUpdated",
  LOGIN: "login",
  LOGIN_FAILED: "loginFailed",
  PASSWORD_SET: "passwordSet",
  /** A Super Admin re-issued someone's invite; the admin set nothing yet. */
  INVITE_RESENT: "inviteResent",
  /** A Super Admin reset someone else's password — not a self-service change. */
  PASSWORD_RESET: "passwordReset",
  EMAIL_SENT: "emailSent",
  SCHEDULED: "scheduled",
  CANCELLED: "cancelled",
  UPLOADED: "uploaded",
  EXPORTED: "exported",
  /** A new record was created by copying an existing one. */
  DUPLICATED: "duplicated",
  /** An admin minted a link that renders unpublished content on the site. */
  PREVIEWED: "previewed",
  /** Workflow lifecycle. `published` already exists and is reused for it. */
  PAUSED: "paused",
  RESUMED: "resumed",
  ARCHIVED: "archived",
  /** A community project submission was accepted into the library. */
  APPROVED: "approved",
  /** …or turned down. The row is kept — it is the record of what was reviewed. */
  REJECTED: "rejected",
};

/** Method → verb, for routes the registry has no entry for yet. */
export const METHOD_VERB_FALLBACK = {
  POST: ACTIVITY_VERB.CREATED,
  PUT: ACTIVITY_VERB.UPDATED,
  PATCH: ACTIVITY_VERB.UPDATED,
  DELETE: ACTIVITY_VERB.DELETED,
};

/**
 * Stripped at any depth, from request bodies and from diffs, before anything is
 * persisted. Matched case-insensitively against the key name.
 */
export const ACTIVITY_REDACT_KEYS = [
  "password",
  "newpassword",
  "confirmpassword",
  "currentpassword",
  // Matching is an exact lowercase key comparison, not a substring test, so
  // every spelling a caller might use has to be listed on its own.
  "temporarypassword",
  "temppassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "apikey",
  "authorization",
  "otp",
  // Facebook page access tokens. Without these two the first
  // POST /meta/accounts writes a live credential into an append-only table
  // that has no update path — the one item on the meta checklist that is a
  // security bug if skipped.
  "pagetoken",
  "pagetokenenc",
];

export const ACTIVITY_LIMITS = {
  /** A single scalar longer than this is replaced with a size summary. */
  MAX_STRING: 300,
  /** Hard cap on the serialised `changes` column. */
  MAX_CHANGES_BYTES: 8_000,
  /** Hard cap on the serialised `metadata` column. */
  MAX_METADATA_BYTES: 4_000,
  /** How deep `buildChanges` recurses into plain objects (JSONB blocks). */
  MAX_DIFF_DEPTH: 1,
  MAX_SUMMARY: 500,
  MAX_USER_AGENT: 255,
  /** Rows older than this are removed by the retention job. */
  RETENTION_DAYS: 730,
};
