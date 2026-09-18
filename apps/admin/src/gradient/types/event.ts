import { IPaginationMeta } from "./pagination";
import { EventSettings } from "./eventFeedback";

export interface EventMeta {
  metaTitle?: string;
  metaDesc?: string;
}

export interface EventResponse {
  id: string;
  eventTitle: string;
  eventSubtitle?: string;
  eventSlug: string;
  eventStartDate?: string;
  eventEndDate?: string;
  eventStartTime?: string;
  eventEndTime?: string;
  eventCategory: string;
  eventType?: string;
  eventDetails?: any;
  isPublished: boolean;
  /** Whether the public feedback link accepts submissions right now. */
  canAcceptResponse?: boolean;
  /**
   * Feedback + certificate switches. Sparse on the wire — the API stores only
   * what has been explicitly set and layers defaults on read, so treat a
   * missing key as "default", not as false.
   */
  settings?: Partial<EventSettings>;
  createdAt?: string;
  updatedAt?: string;
  speakers?: Array<{
    name: string;
    company: string;
    designation: string;
    imageKey: string;
  }>;
  numberOfAttendees?: number;
  eventCreativeUrl?: string;
  ctaType?: string;
  location?: string;
  locationType?: string;
  tags?: string[];
  seo?: {
    metaTitle: string;
    metaDesc: string;
  };
}

export interface CreateEventPayload {
  eventTitle: string;
  eventCategory: string;
  eventType: string;
  eventSlug: string;
  eventSubtitle?: string;
  eventStartDate: string;
  eventEndDate: string;
}

/**
 * Everything else — details, speakers, creative, SEO, settings, email templates
 * and the certificate template — is carried over from the source event by the
 * API, so only what has to differ is sent.
 */
export interface DuplicateEventPayload {
  eventTitle: string;
  eventSlug: string;
  eventStartDate: string;
  eventEndDate: string;
  isPublished: boolean;
}

export interface EventRegistration {
  id: string;
  eventId: string;
  userId: string | null;
  isAccountLinked: boolean;
  name: string;
  email: string;
  phone: string;
  attendeeType: string;
  role: string | null;
  collegeName: string | null;
  graduationYear: number | null;
  referralCode: string | null;
  referrerUserId: string | null;
  linkedinUrl: string | null;
  status: string;
  statusUpdatedBy: string | null;
  statusUpdatedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: any | null;
  statusUpdatedAdmin: any | null;
  additionalData: Record<string, any>
}

export interface EventRegistrationResponse {
  data: EventRegistration[];
  meta: IPaginationMeta;
}
export interface EventGuestStatusStats {
  total: number;
  approved: {
    total: number;
    percentage: number;
  };
  declined: {
    total: number;
    percentage: number;
  };
  waitlisted: {
    total: number;
    percentage: number;
  };
  approvalRate: number;
}

export interface EventGuestStatusResponse {
  data: EventGuestStatusStats;
}

/* ── Referrals ─────────────────────────────────────────────────────────── */

export interface ReferralLeaderboardRow {
  referrerUserId: string;
  name: string;
  email: string;
  phone: string;
  referralCode: string | null;
  referredCount: number;
  /** The referrer's own registration for this event — null if they never registered. */
  guestId: string | null;
  status: string | null;
  attendeeType: string | null;
}

export interface ReferralLeaderboardResponse {
  data: ReferralLeaderboardRow[];
  meta: IPaginationMeta;
}

export interface ReferredGuest {
  id: string;
  name: string;
  email: string | null;
  phone: string;
  attendeeType: string;
  status: string;
  createdAt: string;
}

export interface ReferralStats {
  totalReferred: number;
  totalReferrers: number;
  topReferrer: {
    referrerUserId: string;
    name: string;
    email: string;
    referredCount: number;
  } | null;
}
