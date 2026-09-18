import { LEAD_STATUS } from "./lead.js";

/**
 * Facebook Lead Ads vocabulary.
 *
 * `meta_leads` is a separate table from `leads` (see `FACEBOOK_LEADS_PLAN.md`
 * §2) but the two share every status they have in common, so the shared values
 * are spread from `LEAD_STATUS` rather than retyped. Retyping them is how two
 * tables end up disagreeing about whether the word is "converted" or
 * "Converted" eighteen months from now.
 */
export const META_LEAD_STATUS = Object.freeze({
  ...LEAD_STATUS,
  /**
   * Facebook returned a lead with neither an email nor a phone number.
   *
   * The row is kept rather than dropped — it is a real ad spend and a real
   * person, and the count is the signal that a form is misconfigured. It is
   * never mailed and never counted as a duplicate.
   */
  SKIPPED: "skipped",
});

/** Only these can be set from the panel. Everything else is Facebook's. */
export const META_LEAD_EDITABLE_STATUS = Object.freeze(
  Object.values(LEAD_STATUS),
);

export const META_TOKEN_STATUS = Object.freeze({
  UNKNOWN: "unknown",
  VALID: "valid",
  INVALID: "invalid",
});

export const META_BACKFILL_STATUS = Object.freeze({
  RUNNING: "running",
  DONE: "done",
  ERROR: "error",
});

export const META_POLL_LOG_STATUS = Object.freeze({
  SUCCESS: "success",
  ERROR: "error",
  BACKFILL: "backfill",
});

/** How a row got here — the poll's rolling window, or an operator's backfill. */
export const META_IMPORT_SOURCE = Object.freeze({
  POLL: "poll",
  BACKFILL: "backfill",
});

export const META_SKIP_REASON = Object.freeze({
  /** Neither email nor phone — nothing to contact them with. */
  NO_CONTACT: "no_contact",
  /** The payload could not be parsed into a lead at all. */
  INVALID_PAYLOAD: "invalid_payload",
});

/**
 * Default routing when a form has no mapping and its account has no default.
 *
 * `source` matches the string the public site would post, so a Facebook lead
 * reads the same way a website lead does wherever the two are shown together.
 */
export const META_DEFAULT_SOURCE = "facebook";
export const META_DEFAULT_SOURCE_DISPLAY_NAME = "Facebook";

/**
 * The poll runs every 5 minutes and asks for the last 10.
 *
 * The overlap is deliberate: one slow or failed run cannot drop a lead, because
 * the next run re-covers its window. `meta_leads.metaLeadId` is unique, so the
 * repeats it produces cost one index lookup and nothing else.
 */
export const META_POLL_LOOKBACK_SECONDS = 600;

export const META_POLL_INTERVAL = "5 minutes";
export const META_FORM_SYNC_INTERVAL = "1 hour";

/** Graph's own page size for lead reads. */
export const META_BACKFILL_PAGE_SIZE = 100;

/**
 * The poll asks for pages of this size and follows the cursor.
 *
 * Graph defaults to 25 when no limit is given, and the poll's window moves on
 * every cycle — so a form that took 26 leads in ten minutes would have lost the
 * oldest of them permanently, with nothing anywhere reporting a problem. The
 * lookback overlap protects against a *failed* run, not against a truncated one.
 */
export const META_POLL_PAGE_SIZE = 100;

/**
 * Pages one form may consume in a single poll cycle.
 *
 * 1,000 leads in ten minutes on one form is far past normal and into "something
 * is wrong"; stopping there keeps one runaway form from starving the others of
 * the cycle. Anything genuinely that large is a backfill, not a poll.
 */
export const META_POLL_MAX_PAGES = 10;

/** Guard against a paginator that never terminates. */
export const META_BACKFILL_MAX_LEADS = 50_000;

/**
 * A backfill still marked `running` after this long is treated as abandoned —
 * the process died mid-import and nothing will ever finish it. Mirrors the
 * lock lifetime the campaign send job uses for the same reason.
 */
export const META_BACKFILL_LOCK_LIFETIME = 60 * 60 * 1000;

/** Graph error code for an expired, revoked or otherwise invalid token. */
export const META_INVALID_TOKEN_ERROR_CODE = 190;

/** At most one token-expiry alert per account per this window. */
export const META_ALERT_DEBOUNCE_MS = 12 * 60 * 60 * 1000;
