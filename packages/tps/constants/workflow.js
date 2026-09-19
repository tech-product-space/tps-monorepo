"use strict";

const WORKFLOW_STATUS = Object.freeze({
  DRAFT: "draft",
  ACTIVE: "active",
  PAUSED: "paused",
  ARCHIVED: "archived",
});

const ENROLLMENT_STATUS = Object.freeze({
  ACTIVE: "active",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
  PAUSED: "paused",
  // WAITING = parked on a control.condition node; cap still counts these as
  // "in a workflow". Re-enters the advance pipeline on event arrival or
  // timeout.
  WAITING: "waiting",
});

const NODE_RUN_STATUS = Object.freeze({
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  SKIPPED: "skipped",
});

const TRIGGER_TYPE = Object.freeze({
  NEW_LEAD: "trigger.new_lead",
  STATIC_LIST: "trigger.static_list",
});

const NODE_TYPE = Object.freeze({
  ACTION_SEND_EMAIL: "action.send_email",
  ACTION_SEND_WHATSAPP: "action.send_whatsapp",
  CONTROL_DELAY: "control.delay",
  CONTROL_CONDITION: "control.condition",
  CONTROL_AB_SPLIT: "control.ab_split",
  CONTROL_GOAL: "control.goal",
});

const LEAD_SOURCE_TYPE = Object.freeze({
  PLATFORM_LEADS: "platform_leads",
  EXTERNAL_LEADS: "external_leads",
  EVENTS: "events",
  RESOURCES: "resources",
  // Somebody who passed a session recording's email gate.
  RECORDINGS: "recordings",
  CONTACT_LIST: "contact_list",
  USERS: "users",
});

const ENROLLMENT_SOURCE = Object.freeze({
  NEW_LEAD: "new_lead",
  STATIC_LIST: "static_list",
  MANUAL: "manual",
});

const DURATION_UNIT = Object.freeze({
  SECONDS: "seconds",
  MINUTES: "minutes",
  HOURS: "hours",
  DAYS: "days",
  WEEKS: "weeks",
});

const EDGE_LABEL = Object.freeze({
  MATCH: "match",
  NO_MATCH: "no_match",
});

const LEAD_EVENT_TYPE = Object.freeze({
  EMAIL_SENT: "email.sent",
  EMAIL_OPENED: "email.opened",
  EMAIL_CLICKED: "email.clicked",
  EMAIL_BOUNCED: "email.bounced",
  EMAIL_COMPLAINED: "email.complained",
  EMAIL_UNSUBSCRIBED: "email.unsubscribed",
  GOAL_REACHED: "goal.reached",
});

module.exports = {
  WORKFLOW_STATUS,
  ENROLLMENT_STATUS,
  NODE_RUN_STATUS,
  TRIGGER_TYPE,
  NODE_TYPE,
  LEAD_SOURCE_TYPE,
  ENROLLMENT_SOURCE,
  DURATION_UNIT,
  EDGE_LABEL,
  LEAD_EVENT_TYPE,
};
