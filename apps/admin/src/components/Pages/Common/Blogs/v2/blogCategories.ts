// Blog categories — kept in sync with the v1 editor's inline list and the
// public site's BLOG_CATEGORIES.
export const BLOG_CATEGORIES = [
  "Product Fundamentals",
  "AI Product Management",
  "Frameworks",
  "AI & PM Tools",
  "Case Studies",
  "Interview Prep",
  "Career Transition",
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];
