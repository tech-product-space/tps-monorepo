import type { ActivityLog } from "@/gradient/types/activity";

/**
 * The backend stores facts (`action`, `entityType`, `entityLabel`, `changes`) and
 * this file turns them into a sentence. Keeping the wording here means a new verb
 * or entity is a display change, not a migration.
 */

/** Verb → past-tense phrase used in the sentence. */
export const VERB_LABELS: Record<string, string> = {
  created: "created",
  updated: "updated",
  deleted: "deleted",
  published: "published",
  unpublished: "moved to draft",
  // Workflow lifecycle. `published` above is reused for going live.
  paused: "paused",
  resumed: "resumed",
  archived: "archived",
  reordered: "reordered",
  statusChanged: "changed the status of",
  bulkUpdated: "bulk-updated",
  login: "signed in",
  loginFailed: "failed to sign in",
  passwordSet: "set a password for",
  inviteResent: "resent an invite to",
  passwordReset: "reset the password for",
  emailSent: "sent an email for",
  scheduled: "scheduled",
  cancelled: "cancelled",
  uploaded: "uploaded",
  exported: "exported",
  // Names the copy, not the source — that is the row it links to, and the one
  // you want to open after seeing the entry.
  duplicated: "duplicated",
  // Reads as "Priya generated a preview link for <course>" — the row is about
  // the link, not about a change, because nothing changed.
  previewed: "generated a preview link for",
};

/** Entity → singular noun used in the sentence. */
export const ENTITY_LABELS: Record<string, string> = {
  course: "course",
  workflow: "automation",
  freeCourse: "free course",
  freeCourseModule: "module",
  freeCourseLesson: "lesson",
  event: "event",
  eventGuest: "event guest",
  eventReminder: "reminder",
  blog: "blog post",
  resource: "resource",
  recording: "recording",
  recordingCategory: "recording category",
  lead: "lead",
  job: "job",
  subscriber: "subscriber",
  admin: "admin user",
  adminRole: "role",
  emailTemplate: "email template",
  campaign: "campaign",
  contactList: "contact list",
  file: "file",
};

/** Tailwind classes per verb group, for the action badge. */
export const VERB_STYLES: Record<string, string> = {
  created: "bg-green-100 text-green-700",
  resumed: "bg-green-100 text-green-700",
  duplicated: "bg-green-100 text-green-700",
  published: "bg-green-100 text-green-700",
  updated: "bg-blue-100 text-blue-700",
  reordered: "bg-blue-100 text-blue-700",
  statusChanged: "bg-blue-100 text-blue-700",
  paused: "bg-amber-100 text-amber-700",
  archived: "bg-zinc-100 text-zinc-600",
  bulkUpdated: "bg-amber-100 text-amber-700",
  unpublished: "bg-amber-100 text-amber-700",
  cancelled: "bg-amber-100 text-amber-700",
  deleted: "bg-red-100 text-red-700",
  loginFailed: "bg-red-100 text-red-700",
  login: "bg-gray-100 text-gray-700",
  passwordSet: "bg-purple-100 text-purple-700",
  inviteResent: "bg-purple-100 text-purple-700",
  // Amber, not purple — one admin changing another's password should stand out
  // when you scan the feed.
  passwordReset: "bg-amber-100 text-amber-700",
  emailSent: "bg-purple-100 text-purple-700",
  scheduled: "bg-purple-100 text-purple-700",
  uploaded: "bg-gray-100 text-gray-700",
  exported: "bg-gray-100 text-gray-700",
  // Read-only, but it hands out a bypass of every publish flag on the course —
  // amber so it does not read as routine while scanning the feed.
  previewed: "bg-amber-100 text-amber-700",
};

/**
 * Entity → detail page. Only entities with their own page appear; the rest render
 * as plain text rather than a dead link.
 */
const ENTITY_HREFS: Record<string, (id: string) => string> = {
  course: (id) => `/courses/${id}`,
  workflow: (id) => `/marketing/automations/${id}`,
  freeCourse: (id) => `/free-courses/${id}`,
  event: (id) => `/events/${id}`,
  blog: (id) => `/blog/${id}`,
  resource: (id) => `/resources/${id}`,
  recording: (id) => `/recordings/${id}`,
  job: (id) => `/jobs/edit/${id}`,
  campaign: (id) => `/marketing/campaigns/${id}`,
};

export const splitAction = (action: string) => {
  const separator = action.indexOf(".");

  if (separator === -1) return { entityType: action, verb: "updated" };

  return {
    entityType: action.slice(0, separator),
    verb: action.slice(separator + 1),
  };
};

export const getVerb = (log: ActivityLog) => splitAction(log.action).verb;

export const getVerbStyle = (log: ActivityLog) =>
  VERB_STYLES[getVerb(log)] || "bg-gray-100 text-gray-700";

export const getEntityLabel = (entityType: string) =>
  ENTITY_LABELS[entityType] || entityType;

export const getEntityHref = (log: ActivityLog) => {
  if (!log.entityId) return null;

  const builder = ENTITY_HREFS[log.entityType];

  return builder ? builder(log.entityId) : null;
};

export const getActorName = (log: ActivityLog) =>
  log.actorName || log.actorEmail || "Unknown user";

/**
 * The sentence, as three parts so the entity can be a link.
 *
 * Degrades cleanly: a row written by the registry's fallback has no label and no
 * diff, and still reads as "Priya updated a course" rather than rendering blank.
 */
export const describeActivity = (log: ActivityLog) => {
  const { entityType, verb } = splitAction(log.action);
  const verbLabel = VERB_LABELS[verb] || verb;
  const entityLabel = getEntityLabel(entityType);

  // Login is about the actor, not a target — "Priya signed in", full stop.
  if (verb === "login" || verb === "loginFailed") {
    return { prefix: verbLabel, target: null, suffix: "" };
  }

  if (log.summary) {
    return { prefix: log.summary, target: log.entityLabel, suffix: "" };
  }

  if (log.entityLabel) {
    return { prefix: verbLabel, target: log.entityLabel, suffix: "" };
  }

  const article = /^[aeiou]/i.test(entityLabel) ? "an" : "a";

  return { prefix: `${verbLabel} ${article}`, target: null, suffix: entityLabel };
};

/** "pricing.earlyBirdPrice" → "Pricing › Early Bird Price" */
export const formatFieldPath = (path: string) =>
  path
    .split(".")
    .map((segment) =>
      segment
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/^./, (char) => char.toUpperCase()),
    )
    .join(" › ");

export const formatChangeValue = (value: unknown): string => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value === "" ? "—" : value;

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

export const formatActivityDate = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export const formatRelativeTime = (iso: string) => {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);

  if (seconds < 60) return "just now";

  const units: [number, string][] = [
    [60, "minute"],
    [3600, "hour"],
    [86400, "day"],
    [2592000, "month"],
  ];

  for (let i = units.length - 1; i >= 0; i--) {
    const [divisor, name] = units[i];
    const value = Math.floor(seconds / divisor);

    if (value >= 1) return `${value} ${name}${value === 1 ? "" : "s"} ago`;
  }

  return "just now";
};
