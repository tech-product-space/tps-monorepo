export const SUBSCRIBER_STATUS = Object.freeze({
  ACTIVE: "active",
  UNSUBSCRIBED: "unsubscribed",
});

/**
 * Where the row came from — not where the person unsubscribed from.
 *
 * This table is the suppression list for marketing campaigns as well as the
 * newsletter list, so a row can exist for someone who never subscribed to
 * anything: they clicked unsubscribe in a campaign and we recorded the consent.
 * `source` is what tells those apart afterwards.
 */
export const SUBSCRIBER_SOURCE = Object.freeze({
  /** The newsletter box in the website footer. The original and still the default. */
  FOOTER: "footer",
  /** Never subscribed; opted out of a campaign, so the row exists only to suppress. */
  CAMPAIGN_UNSUBSCRIBE: "campaignUnsubscribe",
  /** Added by a CSV contact-list upload. */
  IMPORT: "import",
  /**
   * Mailbox is dead or the person hit "spam". Not a preference — see
   * `REACTIVATABLE_SOURCES`. Nothing writes these yet; automatic bounce
   * handling is deferred (MARKETING_CAMPAIGN_PLAN.md §9.4) and they are
   * defined now so the re-subscribe carve-out below is written once.
   */
  BOUNCE: "bounce",
  COMPLAINT: "complaint",
});

/**
 * Sources a footer signup is allowed to flip back to ACTIVE.
 *
 * Someone typing their address into the newsletter box is a fresh opt-in, so an
 * earlier *preference* to leave is theirs to reverse. A bounce or a spam
 * complaint is not a preference — the mailbox is gone, or the person told their
 * provider we are spam — and re-activating those would put a known-bad address
 * back into every future audience and push the bounce rate back up.
 */
export const REACTIVATABLE_SOURCES = Object.freeze([
  SUBSCRIBER_SOURCE.FOOTER,
  SUBSCRIBER_SOURCE.CAMPAIGN_UNSUBSCRIBE,
  SUBSCRIBER_SOURCE.IMPORT,
]);
