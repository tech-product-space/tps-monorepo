/**
 * Free course certificates — the parts specific to completing a course.
 *
 * The shared half (page geometry, fonts, weights, storage prefix) lives in
 * `certificate.js`. Statuses are copied from the event enum rather than shared:
 * they mean the same things, but a shared enum invites a shared state machine,
 * and the two domains deliberately keep their own.
 */

export const FREE_COURSE_CERTIFICATE_STATUS = Object.freeze({
  /**
   * Eligible, nothing rendered.
   *
   * No path creates one today — auto-issue and admin Generate both go straight
   * to Approved. Kept because the Learners tab may grow a review step, and a
   * status that exists but is unused is cheaper than a migration later.
   */
  PENDING: "Pending",
  // Cleared to send; a job is queued.
  APPROVED: "Approved",
  // A job has it right now. Guards against two workers rendering the same row.
  ISSUING: "Issuing",
  // PDF exists in S3. Says nothing about the email — check emailSentAt.
  ISSUED: "Issued",
  // Render or upload threw. lastError says why; retry moves it back to Approved.
  FAILED: "Failed",
  // Withdrawn. The download route stops resolving it, which is the only reason
  // revocation actually works — the S3 object is private and there is no other
  // way to reach the file.
  REVOKED: "Revoked",
});

export const FREE_COURSE_CERTIFICATE_ISSUED_VIA = Object.freeze({
  /** The learner marked the last lesson complete. */
  AUTO: "Auto",
  /**
   * An idempotent re-check found them eligible with no certificate.
   *
   * Distinct from AUTO on purpose: this is the path that catches drift — a
   * lesson unpublished into completion, someone who finished before the feature
   * shipped — and being able to count them separately is how you find out
   * whether the automatic trigger is actually doing its job.
   */
  ENSURE: "Ensure",
  /** An admin pressed Generate. `issuedBy` is set. */
  ADMIN: "Admin",
  /** Replaces one revoked for a typo'd name. */
  CORRECTION: "Correction",
});

/**
 * Placeholders a free course certificate template can position on the canvas.
 * Anything outside this set is skipped by the renderer with a warning rather
 * than drawn as empty text.
 *
 * `courseTitle`, not the event catalogue's `eventTitle`. A template stores its
 * field keys in JSONB, and an admin designing a course certificate should not
 * be offered a placeholder labelled "Event title" — while a template that
 * somehow carries `eventTitle` gets caught by the unknown-key warning instead
 * of rendering blank.
 */
export const FREE_COURSE_CERTIFICATE_FIELD_KEYS = Object.freeze({
  RECIPIENT_NAME: "recipientName",
  ISSUED_DATE: "issuedDate",
  CERTIFICATE_NO: "certificateNo",
  COURSE_TITLE: "courseTitle",
});

/**
 * How long a certificate may sit on Approved before Generate treats it as
 * stalled and re-queues it.
 *
 * A render is seconds — canvas, one S3 put, one send — and the queue picks a job
 * up within a poll interval. Five minutes is far past any healthy case while
 * still short enough that an admin who notices a stuck row can fix it in the
 * same sitting rather than filing a ticket.
 */
export const STALE_APPROVED_MS = 5 * 60 * 1000;

/**
 * How long a certificate may sit on Issuing before the claim treats it as
 * abandoned and lets a new worker take it.
 *
 * Issuing means "a process is rendering this right now", and the claim exists
 * so two workers cannot render the same row. If that process dies — a restart
 * mid-render, an OOM, a deploy — nothing ever moves the row off Issuing, and
 * the status that protects it from a double send becomes the status that
 * strands it forever: not Failed, so no retry; not Approved, so Generate's
 * stale sweep does not see it; not Issued, so the learner polls a certificate
 * that will never arrive.
 *
 * The cutoff is what distinguishes a live render from a dead one. It must stay
 * comfortably longer than a real render, because reclaiming a row that is still
 * being worked on is how you get two certificates and two emails.
 */
export const STALE_ISSUING_MS = 5 * 60 * 1000;
