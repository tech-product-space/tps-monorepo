/**
 * Event certificates — the parts that are specific to an event earning one.
 *
 * Page geometry, the font manifest, weights and the storage prefix moved to
 * `certificate.js` when free courses started issuing certificates too. They are
 * re-exported here rather than left behind, so the two dozen files that import
 * them from this path keep working untouched — the split is an internal
 * reorganisation, not an API change.
 */

export {
  CERTIFICATE_DEFAULT_FONT_FAMILY,
  CERTIFICATE_FONT_FAMILIES,
  CERTIFICATE_FONT_WEIGHTS,
  CERTIFICATE_FONTS,
  CERTIFICATE_LEGACY_WEIGHTS,
  CERTIFICATE_ORIENTATION,
  CERTIFICATE_PAGE_WIDTH_PT,
  CERTIFICATE_S3_PREFIX,
} from "./certificate.js";

export const EVENT_CERTIFICATE_STATUS = Object.freeze({
  // Recipient identified, nothing rendered. Either auto-issue was off, or a
  // template was missing when the feedback landed.
  PENDING: "Pending",
  // Cleared to send; a job is queued.
  APPROVED: "Approved",
  // A job has it right now. Guards against two workers rendering the same row.
  ISSUING: "Issuing",
  // PDF exists in S3. Note this says nothing about the email — check emailSentAt.
  ISSUED: "Issued",
  // Render or upload threw. lastError says why; retry moves it back to Approved.
  FAILED: "Failed",
  // Withdrawn. The verify endpoint stops minting URLs, which is the only reason
  // revocation actually works — the S3 object is private.
  REVOKED: "Revoked",
});

export const EVENT_CERTIFICATE_SOURCE = Object.freeze({
  // Submitted the feedback themselves.
  ATTENDEE: "Attendee",
  // Named inside someone else's submission. May never have registered.
  TEAMMATE: "Teammate",
});

export const EVENT_CERTIFICATE_APPROVED_VIA = Object.freeze({
  AUTO: "Auto",
  ADMIN: "Admin",
  CORRECTION: "Correction",
});

/**
 * Placeholders an *event* certificate template can position on the canvas.
 * Anything outside this set is skipped by the renderer with a warning rather
 * than drawn as empty text.
 *
 * Free courses have their own catalogue with `courseTitle` in place of
 * `eventTitle`. Deliberately not merged into one superset: a template stores
 * its field keys in JSONB, and an admin designing a course certificate should
 * not be offered a placeholder labelled "Event title" — while a course template
 * that somehow carries `eventTitle` should be caught by the unknown-key warning
 * instead of silently rendering blank.
 */
export const CERTIFICATE_FIELD_KEYS = Object.freeze({
  RECIPIENT_NAME: "recipientName",
  ISSUED_DATE: "issuedDate",
  CERTIFICATE_NO: "certificateNo",
  EVENT_TITLE: "eventTitle",
});
