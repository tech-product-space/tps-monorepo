// Catalog of website lead-source forms that the realtime trigger
// (trigger.new_lead) can watch. Each entry maps a user-facing label to the
// exact `type` string the website sends in its POST /leads body.
//
// The source-of-truth lives in product-space-next-ui — this file mirrors it.
// If a new form is added on the website, add it here so it shows up in the
// admin's "When a new lead arrives" picker.

export type LeadFormCategory =
  | "enrollment"
  | "curriculum_download"
  | "popup"
  | "callback";

export interface LeadFormDef {
  /** Literal value of platform_leads.type */
  type: string;
  /** Human-readable label for the picker */
  label: string;
  /** Short description shown under the label */
  description?: string;
  category: LeadFormCategory;
}

export const LEAD_FORM_CATALOG: LeadFormDef[] = [
  // ---- Enrollments ----------------------------------------------------
  {
    type: "pm-fellowship-enrollments",
    label: "PM Fellowship — Enrollment",
    category: "enrollment",
  },
  {
    type: "free-course-enrollments",
    label: "AI Builders 101 — Enrollment",
    category: "enrollment",
  },
  {
    type: "ai-for-pm-enrollments",
    label: "Generative AI Program — Enrollment",
    category: "enrollment",
  },

  // ---- Curriculum downloads ------------------------------------------
  {
    type: "pm-fellowship-download-curriculum",
    label: "PM Fellowship — Curriculum download",
    category: "curriculum_download",
  },
  {
    type: "ai-for-pm-download-curriculum",
    label: "Generative AI — Curriculum download",
    category: "curriculum_download",
  },

  // ---- Popups ---------------------------------------------------------
  {
    type: "pm-fellowship-course-counselling",
    label: "PM Fellowship Counselling Popup",
    category: "popup",
  },
  {
    type: "event-referral-counselling",
    label: "Event Referral Counselling Popup",
    category: "popup",
  },
  {
    type: "resource-download-popup",
    label: "Resource Download popup",
    category: "popup",
  },

  // ---- Request CallBacks ----------------------------------------------
  {
    type: "request-callback",
    label: "Global — Request callback",
    category: "callback",
  },
];

export const CATEGORY_LABELS: Record<LeadFormCategory, string> = {
  enrollment: "Enrollment forms",
  curriculum_download: "Curriculum downloads",
  popup: "Popups",
  callback: "Request CallBacks",
};

/** Stable display order for categories in the picker. */
export const CATEGORY_ORDER: LeadFormCategory[] = [
  "enrollment",
  "curriculum_download",
  "popup",
  "callback",
];

/** Set of all known form `type` values — used to drop legacy types on load. */
export const KNOWN_FORM_TYPES: Set<string> = new Set(
  LEAD_FORM_CATALOG.map((f) => f.type)
);

export function groupFormsByCategory(): Record<LeadFormCategory, LeadFormDef[]> {
  const grouped = {} as Record<LeadFormCategory, LeadFormDef[]>;
  for (const f of LEAD_FORM_CATALOG) {
    if (!grouped[f.category]) grouped[f.category] = [];
    grouped[f.category].push(f);
  }
  return grouped;
}
