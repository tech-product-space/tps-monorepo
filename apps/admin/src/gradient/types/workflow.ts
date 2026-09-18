import type { RecipientFilters, CampaignSourceType } from "./campaign";

/**
 * Mirrors `gradient-backend/src/config/constants/workflow.js`. Keep in sync.
 *
 * Wording lives here, not in components: the same status appears on the list,
 * the editor header and the enrolment table, and three copies of "Live" is
 * three chances for one of them to say something else.
 */

export type WorkflowStatus = "draft" | "active" | "paused" | "archived";

export type WorkflowTriggerType = "newActivity" | "staticList";

export type WorkflowNodeType = "sendEmail" | "wait" | "branch" | "exit";

export type EnrollmentStatus =
  | "active"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";

export type NodeRunStatus = "running" | "completed" | "failed" | "skipped";

export type DurationUnit = "minutes" | "hours" | "days" | "weeks";

/* ── step configs ───────────────────────────────────────────────────────── */

export interface SendEmailConfig {
  subject: string;
  body: string;
  senderEmail: string;
  senderName?: string;
  replyTo?: string;
}

export interface WaitConfig {
  value: number;
  unit: DurationUnit;
}

export interface ExitConfig {
  reason?: string;
}

/** Where a branch starts counting from. `previousStep` is the useful default. */
export type ConditionSince = "enrollmentStart" | "previousStep";

export interface BranchConfig {
  /** A `LEAD_EVENT_TYPE` value — the list comes from `GET /admin/conditions`. */
  eventType: string;
  since?: ConditionSince;
  timeoutValue: number;
  timeoutUnit: DurationUnit;
  /** Narrows to a specific event or course. Empty narrows nothing. */
  match?: Record<string, unknown>;
}

export interface ConditionOption {
  eventType: string;
  label: string;
}

export type NodeConfig =
  | SendEmailConfig
  | WaitConfig
  | BranchConfig
  | ExitConfig
  | Record<string, unknown>;

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  config: NodeConfig;
  /**
   * Persisted even though the phase-4 editor is a linear list, so the canvas
   * in phase 5 opens existing workflows at the layout they were built in
   * rather than guessing one.
   */
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  from: string;
  to: string;
  label?: "yes" | "no";
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  entryNodeId?: string | null;
}

/* ── triggers ───────────────────────────────────────────────────────────── */

export interface TriggerSourceClause {
  type: CampaignSourceType;
  filters?: Record<string, unknown>;
}

export interface NewActivityTriggerConfig {
  sources: TriggerSourceClause[];
  allowReEnrollment?: boolean;
}

export interface StaticListTriggerConfig {
  recipientFilters: RecipientFilters;
  allowReEnrollment?: boolean;
}

export type TriggerConfig =
  | NewActivityTriggerConfig
  | StaticListTriggerConfig
  | Record<string, unknown>;

/* ── entities ───────────────────────────────────────────────────────────── */

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  triggerType: WorkflowTriggerType | null;
  triggerConfig: TriggerConfig;
  definition: WorkflowDefinition;
  settings: Record<string, unknown>;
  currentVersion: number | null;
  publishedAt: string | null;
  createdBy: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Injected by the list endpoint. */
  liveEnrollments?: number;
}

export interface WorkflowVersion {
  id: string;
  workflowId: string;
  version: number;
  definition: WorkflowDefinition & { trigger: unknown };
  publishedBy: string | null;
  publishedAt: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface WorkflowDetail {
  workflow: Workflow;
  activeVersion: WorkflowVersion | null;
  stats: Record<EnrollmentStatus, number>;
  validation: ValidationResult;
}

export interface Enrollment {
  id: string;
  workflowId: string;
  workflowVersion: number;
  email: string;
  name: string | null;
  phone: string | null;
  sourceType: string | null;
  sourceId: string | null;
  enrollmentSource: string;
  status: EnrollmentStatus;
  currentNodeId: string | null;
  nextRunAt: string | null;
  enrolledAt: string;
  completedAt: string | null;
  endReason: string | null;
  workflow?: { id: string; name: string; status: WorkflowStatus };
}

export interface NodeRun {
  id: string;
  nodeId: string;
  nodeType: WorkflowNodeType;
  attempt: number;
  status: NodeRunStatus;
  startedAt: string;
  finishedAt: string | null;
  output: Record<string, unknown>;
  providerMessageId: string | null;
  error: string | null;
}

export interface TimelineEvent {
  id: string;
  eventType: string;
  label: string;
  subject: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

export interface EnrollmentDetail {
  enrollment: Enrollment;
  currentStep: WorkflowNode | null;
  definition: WorkflowDefinition | null;
  nodeRuns: NodeRun[];
  events: TimelineEvent[];
}

export interface WorkflowHealth {
  enabled: boolean;
  redis: "up" | "down" | "disabled";
  workerSeenAt: string | null;
  workerAlive: boolean;
  healthy: boolean;
  message: string;
  queues: Record<string, Record<string, number> | null>;
}

/** One step's numbers. `branch` is null for everything that is not an if/then. */
export interface NodeReport {
  nodeId: string;
  nodeType: WorkflowNodeType;
  label: string;
  /** Distinct people who reached this step. */
  reached: number;
  completed: number;
  failed: number;
  skipped: number;
  /** Live enrolments sitting on it right now. */
  hereNow: number;
  branch: {
    yes: number;
    no: number;
    /** Still undecided — parked, window open. */
    waiting: number;
    /** Null until somebody has actually been through: "0%" and "no data yet"
     *  are different answers and only one of them is a problem. */
    yesRate: number | null;
  } | null;
  /** Ran under a version this workflow no longer uses. */
  retired: boolean;
}

export interface WorkflowReport {
  version: number | null;
  generatedAt: string;
  totals: {
    enrolled: number;
    live: number;
    completed: number;
    failed: number;
    cancelled: number;
    optedOut: number;
  };
  nodes: NodeReport[];
}

/** Whether a static-list Run is still working through its audience. */
export interface RunStatus {
  running: boolean;
  /** Bulk-enrol jobs for this workflow still queued or in progress. */
  pending: number;
  lastRunAt: string | null;
}

export interface AudiencePreview {
  total: number;
  excluded: number;
  sample: { email: string; name: string | null; sourceType: string }[];
}

/* ── wording ────────────────────────────────────────────────────────────── */

export const WORKFLOW_STATUS_LABELS: Record<WorkflowStatus, string> = {
  draft: "Draft",
  active: "Live",
  paused: "Paused",
  archived: "Archived",
};

export const WORKFLOW_STATUS_STYLES: Record<WorkflowStatus, string> = {
  draft: "bg-zinc-100 text-zinc-600 border-zinc-200",
  active: "bg-green-100 text-green-700 border-green-200",
  paused: "bg-amber-100 text-amber-700 border-amber-200",
  archived: "bg-zinc-100 text-zinc-400 border-zinc-200",
};

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  active: "In progress",
  waiting: "Waiting",
  completed: "Finished",
  failed: "Failed",
  cancelled: "Ended early",
};

export const ENROLLMENT_STATUS_STYLES: Record<EnrollmentStatus, string> = {
  active: "bg-blue-100 text-blue-700 border-blue-200",
  waiting: "bg-violet-100 text-violet-700 border-violet-200",
  completed: "bg-green-100 text-green-700 border-green-200",
  failed: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

export const NODE_LABELS: Record<WorkflowNodeType, string> = {
  sendEmail: "Send email",
  wait: "Wait",
  branch: "If / then",
  exit: "Exit",
};

export const DURATION_UNIT_LABELS: Record<DurationUnit, string> = {
  minutes: "minutes",
  hours: "hours",
  days: "days",
  weeks: "weeks",
};

/**
 * Why an enrolment stopped, in words.
 *
 * `endReason` also carries `error:<message>`, which is rendered as-is — the
 * provider's own wording about an unverified sender is more useful than
 * anything this map could say instead.
 */
export const END_REASON_LABELS: Record<string, string> = {
  goal: "Reached the end",
  noNextStep: "Ran out of steps",
  optedOut: "Unsubscribed",
  cancelled: "Cancelled by an admin",
  workflowArchived: "Workflow was archived",
};

/** Why somebody was not enrolled. The API returns these verbatim. */
export const SKIP_REASON_LABELS: Record<string, string> = {
  noEmail: "No email address",
  suppressed: "Unsubscribed",
  alreadyInThisWorkflow: "Already in this workflow",
  completedBefore: "Been through this workflow before",
  capped: "Already in another workflow",
  notPublished: "Workflow is not published",
  emptyDefinition: "Workflow has no steps",
};
