// Shared enums for the support / student-query system.

const STATUS = {
  OPEN: "open",
  IN_PROGRESS: "in_progress",
  CLOSED: "closed",
};

// Statuses considered "active" (still needing attention) for inbox defaults.
const OPEN_STATUSES = [STATUS.OPEN, STATUS.IN_PROGRESS];

const PRIORITY = {
  LOW: "low",
  NORMAL: "normal",
  MEDIUM: "medium",
  HIGH: "high",
};

// Sort weight — lower number = more urgent (used in inbox ordering).
const PRIORITY_RANK = {
  [PRIORITY.HIGH]: 1,
  [PRIORITY.MEDIUM]: 2,
  [PRIORITY.NORMAL]: 3,
  [PRIORITY.LOW]: 4,
};

const SENDER_TYPE = {
  USER: "user",
  STAFF: "staff",
  SYSTEM: "system",
};

const MESSAGE_TYPE = {
  MESSAGE: "message",
  STATUS_CHANGE: "status_change",
  ASSIGNMENT: "assignment",
  SYSTEM: "system",
  // Staff-initiated prompt asking the user to share their phone number. Shown
  // to the user as an inline form; metadata.fulfilled flips true once provided.
  PHONE_REQUEST: "phone_request",
};

// Cohort membership states that count as "active" in cohort_members.status.
// Compared case-insensitively (DB stores e.g. "Active"/"Inactive").
const ACTIVE_COHORT_STATUSES = ["active", "enrolled", "ongoing"];

module.exports = {
  STATUS,
  OPEN_STATUSES,
  PRIORITY,
  PRIORITY_RANK,
  SENDER_TYPE,
  MESSAGE_TYPE,
  ACTIVE_COHORT_STATUSES,
};
