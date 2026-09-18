import { CourseEmailType } from "@/gradient/types/course";

/**
 * Display metadata for each email a course can send. The API returns one entry
 * per type whether or not it has been configured, so adding a type here plus on
 * the API is all a new email needs.
 */
export const COURSE_EMAIL_META: Record<
  CourseEmailType,
  { label: string; description: string }
> = {
  ENROLLMENT_ACK: {
    label: "Enrollment Confirmation",
    description:
      "Sent to the applicant as soon as they submit the enrollment form.",
  },
  BROCHURE_DOWNLOAD: {
    label: "Curriculum Download",
    description:
      "Sent when someone requests the curriculum. Paste the brochure link from the Brochure tab into the body.",
  },
};

/** Rendered in the order a lead would receive them. */
export const COURSE_EMAIL_ORDER: CourseEmailType[] = [
  "ENROLLMENT_ACK",
  "BROCHURE_DOWNLOAD",
];

export const COURSE_LEAD_TYPE_FILTERS = [
  { value: "", label: "All leads" },
  { value: "enrollment_form", label: "Enrollment form" },
  { value: "curriculum_download", label: "Curriculum download" },
];

/**
 * Mirrors derivePricingDisplay on the API, for the pricing preview only.
 * The API is the authority for what the live site renders.
 */
export const formatRupees = (amount: number | null) =>
  typeof amount === "number" && amount > 0
    ? new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
      }).format(amount)
    : "";

export const applyDiscount = (
  price: number | null,
  discountPercent: number,
) => {
  const base = Number(price) || 0;
  const percent = Math.min(Math.max(Number(discountPercent) || 0, 0), 100);

  return percent > 0 ? Math.round(base * (1 - percent / 100)) : base;
};

export const formatCohortDate = (isoDate: string) => {
  const day = formatFullDate(isoDate, { year: undefined });

  return day ? `Starts ${day}` : "";
};

/** Dates that stand alone rather than following a word carry the year. */
export const formatFullDate = (
  isoDate: string,
  { year = "numeric" }: { year?: "numeric" | undefined } = {},
) => {
  if (!isoDate) return "";

  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year,
    timeZone: "UTC",
  }).format(date);
};
