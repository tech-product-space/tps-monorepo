export const BLOG_CATEGORIES = [
  "SQL & Databases",
  "Data Cleaning & Wrangling",
  "Statistics & Probability",
  "Data Visualization",
  "Business Intelligence & Dashboards",
  "AI for Data Analytics",
  "Interview Questions & Preparation",
  "Fundamentals for Beginners",
] as const;

export type BlogCategory = (typeof BLOG_CATEGORIES)[number];