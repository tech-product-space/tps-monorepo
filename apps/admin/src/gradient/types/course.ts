import { IPaginationMeta } from "@/gradient/components/ui/custom/Pagination";
import { Lead } from "./lead";

/**
 * Paid programs. Distinct from FreeCourse — a Course row holds only the
 * commercial layer of a program (pricing, emails, brochure, toggles); the
 * marketing page itself is hand-built per course on the website.
 */

export type GstMode = "inclusive" | "exclusive";

/**
 * Raw values as the admin enters them. The discounted price shown on the site
 * is derived from `price` and `discountPercent` by the API, so the headline
 * figure can never contradict the discount badge beside it.
 */
export interface CoursePricing {
  /** Full price before discount, in rupees. */
  price: number | null;
  /** 0–100. Zero hides the strikethrough and the badge on the site. */
  discountPercent: number;
  /** ISO date (YYYY-MM-DD). */
  cohortDate: string;
  /** ISO date (YYYY-MM-DD) the offer closes. Empty hides the line on the site. */
  offerValidTill: string;
  /**
   * Free text for the urgency line beside the price, e.g. "Early Bird Discount
   * for 4 Seats Only!". Empty hides the line on the site.
   */
  offerLabel: string;
  /**
   * Seats in one cohort. Feeds both the seat count on the pricing panel and the
   * "Only N learners per batch" badge in the hero, so the two always agree.
   */
  cohortSeats: number | null;
  durationLabel: string;
  gstMode: GstMode;
  /** e.g. "6 Months". Empty hides the EMI line. */
  emiPlan: string;
}

/** Reserved for future per-course toggles; nothing lives here yet. */
export type CourseSettings = Record<string, never>;

export interface CourseBrochure {
  fileKey?: string;
  fileName?: string;
  uploadedAt?: string;
}

export interface Course {
  id: string;
  slug: string;
  name: string;
  pricing: CoursePricing;
  brochure: CourseBrochure;
  settings: CourseSettings;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;

  /** List endpoint only. */
  leadCount?: number;

  /** Detail endpoint only — stable permalink to paste into email templates. */
  brochureLink?: string;
  /** Detail endpoint only — direct file URL, for checking the upload. */
  brochureFileUrl?: string;
}

export type CourseEmailType = "ENROLLMENT_ACK" | "BROCHURE_DOWNLOAD";

export interface CourseEmailTemplate {
  type: CourseEmailType;
  subject: string;
  body: string;
  isEnabled: boolean;
  /** False until the template has been saved at least once. */
  isConfigured: boolean;
  updatedAt: string | null;
}

export interface CourseEmailTemplatesResponse {
  success: boolean;
  data: CourseEmailTemplate[];
  meta: {
    /** Placeholder names, without the braces. */
    variables: string[];
    brochureLink: string;
  };
}

export interface CourseLeadsResponse {
  success: boolean;
  data: Lead[];
  meta: IPaginationMeta;
}

/** Matches COURSE_LEAD_SUB_SOURCE on the API. */
export const COURSE_LEAD_SUB_SOURCES = {
  ENROLLMENT: "enrollment_form",
  BROCHURE: "curriculum_download",
} as const;
