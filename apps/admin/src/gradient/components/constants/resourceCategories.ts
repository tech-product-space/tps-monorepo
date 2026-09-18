export const RESOURCE_CATEGORIES = [
  "AI-First Software Developer",
  "Interview Question",
  "Roadmap",
  "Data Structure & Algorithm",
] as const;

export const RESOURCE_TYPES = [
  "System Design",
  "Concept Guide",
  "Cheatsheet",
  "Practice Guide",
  "Interview Prep",
  "Prompt Library",
] as const;

export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];
export type ResourceType = (typeof RESOURCE_TYPES)[number];
