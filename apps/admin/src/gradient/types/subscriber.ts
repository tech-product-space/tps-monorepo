export type SubscriberStatus = "active" | "unsubscribed";

/**
 * Where the row came from — not where the person unsubscribed from. Mirrors
 * SUBSCRIBER_SOURCE in gradient-backend/src/config/constants/subscriber.js.
 */
export type SubscriberSource =
  | "footer"
  | "campaignUnsubscribe"
  | "import"
  | "bounce"
  | "complaint";

export interface Subscriber {
  id: string;
  email: string;
  name?: string | null;
  status: SubscriberStatus;
  source: string;

  /** Set together by the backend's suppression service; all null while active. */
  unsubscribedAt?: string | null;
  unsubscribeReason?: string | null;
  unsubscribedFromCampaignId?: string | null;

  pageUrl?: string;
  referrer?: string;

  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;

  createdAt: string;
}

/** Labels for the source filter and the table's Source column. */
export const SUBSCRIBER_SOURCE_LABELS: Record<string, string> = {
  footer: "Newsletter form",
  campaignUnsubscribe: "Campaign opt-out",
  import: "CSV import",
  bounce: "Bounced",
  complaint: "Spam complaint",
};
