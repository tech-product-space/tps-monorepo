// Lifecycle state of an enrollment (lead_courses row).
//
//   active   -> the student is on the programme; money is collectable
//   dropped  -> the student left; the unpaid balance stops counting as owed,
//               but every payment already received stays exactly where it is
//
// Deliberately two values, not three. A re-enrollment is ALSO 'active' — it is
// distinguished by the is_reenrollment flag, not by a third status. Making this
// a three-way enum would force a re-enrollment that later gets dropped to
// choose between recording "dropped" and "was a return", and would silently
// exclude re-enrollments from every `status = 'active'` filter.
const ENROLLMENT_STATUS = Object.freeze({
  ACTIVE: "active",
  DROPPED: "dropped",
});

const ENROLLMENT_STATUSES = Object.freeze(Object.values(ENROLLMENT_STATUS));

// Accepted values of the ?status= filter on GET /enrollments.
//
// Three of these are VIEWS, not stored statuses:
//   all        -> do not filter
//   deferred   -> status='active' AND is_deferred=true
//   reenrolled -> status='active' AND is_reenrollment=true
//
// Neither is a third value of ENROLLMENT_STATUS: both describe a live
// enrollment, so they must keep matching every `status='active'` query in the
// codebase. They narrow the active set rather than sitting beside it — which is
// also why a DROPPED re-enrollment appears under `dropped`, not here: being
// dropped is what matters about it. Mirrors resolveLifecycle's precedence.
const ENROLLMENT_STATUS_FILTER = Object.freeze({
  ...ENROLLMENT_STATUS,
  ALL: "all",
  DEFERRED: "deferred",
  REENROLLED: "reenrolled",
});

const ENROLLMENT_STATUS_FILTERS = Object.freeze(
  Object.values(ENROLLMENT_STATUS_FILTER),
);

// Drop reason is free text — there is no controlled vocabulary. The trade-off
// is deliberate: reasons are not aggregatable without reading them, and a
// drop_category column can be added later and back-filled if that is wanted.
const DROP_REASON_MIN = 5;
const DROP_REASON_MAX = 500;

// A cohort move needs a reason for the same reason a drop does, and under the
// same rules — it writes off nothing, but it moves money between batches.
const DEFERRAL_REASON_MIN = 5;
const DEFERRAL_REASON_MAX = 500;

// Display-only state of an enrollment, derived and never stored. Several can be
// true at once (a dropped re-enrollment that was deferred first), so the order
// below is the precedence the UI shows: the most recent thing that happened to
// the student wins.
const ENROLLMENT_LIFECYCLE = Object.freeze({
  DROPPED: "dropped",
  DEFERRED: "deferred",
  REENROLLED: "reenrolled",
  ACTIVE: "active",
});

/**
 * The one place that decides which badge an enrollment shows.
 *
 * `dropped` outranks everything — a dropped student is dropped, whatever else
 * happened first. `deferred` outranks `reenrolled` because it is the more
 * recent and more actionable fact about a live enrollment.
 */
function resolveLifecycle(course) {
  if (course.status === ENROLLMENT_STATUS.DROPPED) return ENROLLMENT_LIFECYCLE.DROPPED;
  if (course.is_deferred) return ENROLLMENT_LIFECYCLE.DEFERRED;
  if (course.is_reenrollment) return ENROLLMENT_LIFECYCLE.REENROLLED;
  return ENROLLMENT_LIFECYCLE.ACTIVE;
}

module.exports = {
  ENROLLMENT_STATUS,
  ENROLLMENT_STATUSES,
  ENROLLMENT_STATUS_FILTER,
  ENROLLMENT_STATUS_FILTERS,
  ENROLLMENT_LIFECYCLE,
  resolveLifecycle,
  DROP_REASON_MIN,
  DROP_REASON_MAX,
  DEFERRAL_REASON_MIN,
  DEFERRAL_REASON_MAX,
};
