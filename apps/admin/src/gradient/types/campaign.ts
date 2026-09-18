export type CampaignStatus =
  | "draft"
  | "scheduled"
  | "processing"
  | "sent"
  | "failed";

/** Audience source types. Mirrors CAMPAIGN_SOURCE_TYPE in the backend. */
export type CampaignSourceType =
  | "leads"
  /** Facebook Lead Ads. A separate table from `leads` — see the backend note. */
  | "metaLeads"
  | "resourceLeads"
  /** People who passed a session recording's email gate. Its own table
   *  (`RecordingLeads`), not part of `leads`. */
  | "recordingLeads"
  | "eventGuests"
  | "freeCourseEnrolments"
  | "subscribers"
  | "users"
  | "campaignRecipients"
  | "contactLists"
  | "certificateHolders"
  | "freeCourseProgress"
  | "eventFeedback"
  | "eventReferrers";

/** One clause of an audience. `filters` is source-specific and loosely typed on
 *  purpose — it is stored as JSONB and each resolver reads its own keys. */
export interface AudienceClause {
  type: CampaignSourceType;
  filters: Record<string, unknown>;
}

/**
 * `exclude` is what makes ordinary segments expressible — "downloaded the
 * brochure but has not enrolled", "everyone except last week's send".
 */
export interface RecipientFilters {
  include: AudienceClause[];
  exclude: AudienceClause[];
}

export interface Campaign {
  id: string;
  name: string;
  subject: string | null;
  body: string | null;
  senderEmail: string | null;
  senderName: string | null;
  recipientFilters: RecipientFilters;
  status: CampaignStatus;
  scheduledAt: string | null;
  sentAt: string | null;
  totalRecipients: number;
  totalSent: number;
  totalFailed: number;
  createdAt: string;
  updatedAt: string;
  createdAdmin?: { id: string; name: string; email: string } | null;
}

export interface CampaignRecipientPreview {
  name: string | null;
  email: string;
  sourceType: CampaignSourceType;
  sourceId: string | null;
}

/** Per-source counts. `rows` are records matched, `unique` are people added —
 *  they are not the same number, and showing only the first overstates. */
export interface SourceStat {
  type: CampaignSourceType;
  rows: number;
  unique: number;
  removed?: number;
}

export interface CampaignPreview {
  campaign: Pick<
    Campaign,
    "id" | "name" | "subject" | "senderEmail" | "senderName" | "status"
  >;
  breakdown: { include: SourceStat[]; exclude: SourceStat[] };
  totals: {
    rowsMatched: number;
    uniquePeople: number;
    excluded: number;
    suppressed: number;
    mailable: number;
    /**
     * Matched the filters and has no email address at all — only Facebook lead
     * ads produce these, and often in bulk. Optional because a preview from
     * before this shipped will not carry it.
     */
    unemailable?: number;
  };
  recipients: CampaignRecipientPreview[];
}

export interface CampaignStats {
  campaign: Pick<Campaign, "id" | "name" | "status" | "scheduledAt" | "sentAt">;
  audience: {
    resolved: number;
    queued: number;
    pending: number;
    processing: number;
    sent: number;
    failed: number;
    suppressed: number;
  };
  delivery: {
    sent: number;
    failed: number;
    deliveryRate: number;
    progress: number;
  };
  reaction: { unsubscribed: number; unsubscribeRate: number };
  outcome: { leads: number; subscribers: number; conversionRate: number };
  failures: { error: string; count: number }[];
  window: {
    firstSentAt: string | null;
    lastSentAt: string | null;
    durationMs: number | null;
  };
}

/** Everything the audience selector needs, from one request. */
export interface AudienceSources {
  supportedSourceTypes: CampaignSourceType[];
  leads: {
    sources: {
      source: string;
      sourceDisplayName: string | null;
      subSources: { subSource: string; subSourceDisplayName: string | null }[] | null;
    }[];
    statuses: string[];
  };
  resources: {
    items: {
      id: string;
      title: string;
      resourceType: string | null;
      resourceCategory: string | null;
      /** Rows captured, and unique addresses among them. Not the same number. */
      downloads: number;
      people: number;
    }[];
    types: string[];
    categories: string[];
    tags: string[];
    jobTitles: string[];
  };
  events: {
    items: {
      id: string;
      eventTitle: string;
      eventStartDate: string | null;
      /** Mailable guests only — those with an email address. */
      totalGuests: number;
      guestsByStatus: Record<string, number>;
    }[];
    statuses: string[];
    attendeeTypes: string[];
  };
  freeCourses: { items: { id: string; title: string }[] };
  /** The recordings library. `people` is exact: `RecordingLeads` holds one row
   *  per (recording, email), so nothing needs de-duplicating. */
  recordings: {
    items: {
      id: string;
      title: string;
      categoryId: string | null;
      people: number;
    }[];
    categories: { id: string; name: string }[];
  };
  subscribers: { sources: string[] };
  campaigns: {
    items: { id: string; name: string; status: CampaignStatus; sentAt: string | null }[];
  };
  /** Sizes come with the names — picking a list without knowing whether it
   *  holds 30 people or 30,000 is not a decision anyone can make. */
  contactLists: {
    items: { id: string; name: string; contactCount: number }[];
  };
  /** The certificate and progress pickers reuse `events.items` and
   *  `freeCourses.items`; only their own vocabularies come down separately. */
  certificates: { statuses: string[]; sources: string[] };
  freeCourseProgress: { states: string[] };
}

export interface CampaignSender {
  key: string;
  email: string;
}

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  processing: "Sending",
  sent: "Sent",
  failed: "Failed",
};

export const CAMPAIGN_STATUS_STYLES: Record<CampaignStatus, string> = {
  draft: "bg-zinc-100 text-zinc-600 border-zinc-200",
  scheduled: "bg-blue-100 text-blue-700 border-blue-200",
  processing: "bg-amber-100 text-amber-700 border-amber-200",
  sent: "bg-green-100 text-green-700 border-green-200",
  failed: "bg-red-100 text-red-700 border-red-200",
};

export const SOURCE_LABELS: Record<CampaignSourceType, string> = {
  leads: "Website leads",
  // Named for where they come from, not for the table. "Meta leads" is what
  // the sidebar calls them and what anybody buying the ads calls them.
  metaLeads: "Facebook lead forms",
  resourceLeads: "Resource downloads",
  recordingLeads: "Recording signups",
  eventGuests: "Event registrations",
  freeCourseEnrolments: "Free course enrolments",
  subscribers: "Newsletter subscribers",
  users: "Registered users",
  campaignRecipients: "A previous campaign",
  contactLists: "Uploaded contact lists",
  certificateHolders: "Certificate holders",
  freeCourseProgress: "Free course progress",
  eventFeedback: "Event feedback",
  eventReferrers: "Event referrers",
};
