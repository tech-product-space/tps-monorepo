// Mirrors the backend's constants/workflow.js — keep in sync.

export type WorkflowStatus = "draft" | "active" | "paused" | "archived";

export type EnrollmentStatus =
  | "active"
  | "completed"
  | "failed"
  | "cancelled"
  | "paused"
  | "waiting";

export type NodeRunStatus = "running" | "completed" | "failed" | "skipped";

export type TriggerType = "trigger.new_lead" | "trigger.static_list";

export type NodeType =
  | "action.send_email"
  | "action.send_whatsapp"
  | "control.delay"
  | "control.condition"
  | "control.ab_split"
  | "control.goal";

export type LeadSourceType =
  | "platform_leads"
  | "external_leads"
  | "events"
  | "resources"
  | "contact_list"
  | "users";

export type DurationUnit =
  | "seconds"
  | "minutes"
  | "hours"
  | "days"
  | "weeks";

// ---------------------------------------------------------------------------
// Node config shapes
// ---------------------------------------------------------------------------

export interface SendEmailConfig {
  subject: string;
  html_body: string;
  from_email: string;
  from_name: string;
  reply_to?: string;
}

export interface DelayConfig {
  duration_value: number;
  duration_unit: DurationUnit;
}

export interface GoalConfig {
  goal_name: string;
}

export type LeadEventType =
  | "email.sent"
  | "email.opened"
  | "email.clicked"
  | "email.bounced"
  | "email.complained"
  | "email.unsubscribed"
  | "goal.reached";

// "If / then" node. Parks the enrollment until either the event arrives for
// the lead or the timeout expires; then branches on the 'match' / 'no_match'
// edge label.
export interface ConditionConfig {
  event_type: LeadEventType;
  timeout_value: number;
  timeout_unit: DurationUnit;
}

export type NodeConfig =
  | SendEmailConfig
  | DelayConfig
  | GoalConfig
  | ConditionConfig
  | Record<string, unknown>;

export interface WorkflowNode {
  id: string;
  type: NodeType;
  config: NodeConfig;
  // Canvas position — persisted with the draft definition so reopening the
  // editor preserves layout. Absent for legacy workflows; the editor runs
  // an auto-layout pass on first open in that case.
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  from: string;
  to: string;
  label?: "match" | "no_match";
}

export interface WorkflowDraftDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  // Optional explicit entry node. If set, the engine prefers this node when
  // creating new enrollments. If absent, falls back to "node with no incoming
  // edges" topology inference.
  entry_node_id?: string | null;
}

// ---------------------------------------------------------------------------
// Trigger config
// ---------------------------------------------------------------------------

export interface RecipientFilterSource {
  type: LeadSourceType;
  filters: Record<string, unknown>;
}

export interface RecipientFilter {
  sources: RecipientFilterSource[];
}

export interface StaticListTriggerConfig {
  type: "trigger.static_list";
  config: {
    recipient_filter: RecipientFilter;
    scheduled_at?: string | null;
    batch_size?: number;
  };
}

export interface NewLeadTriggerConfig {
  type: "trigger.new_lead";
  config: {
    recipient_filter: RecipientFilter;
    allow_re_enrollment?: boolean;
  };
}

export type TriggerConfig =
  | StaticListTriggerConfig
  | NewLeadTriggerConfig
  | null;

// ---------------------------------------------------------------------------
// Workflow settings
// ---------------------------------------------------------------------------

export interface WorkflowSettings {
  // Reserved for future per-workflow settings. The daily message cap is now
  // configured globally in /admin/automation/workflows/settings.
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Top-level entities
// ---------------------------------------------------------------------------

export interface Workflow {
  id: string;
  name: string;
  description: string | null;
  status: WorkflowStatus;
  current_version: number | null;
  trigger_config: TriggerConfig;
  settings: WorkflowSettings;
  draft_definition: WorkflowDraftDefinition | null;
  created_by: string | null;
  published_at: string | null;
  createdAt: string;
  updatedAt: string;
  // Derived fields injected by the list endpoint
  active_enrollments?: number;
  trigger_type?: TriggerType | null;
}

export interface WorkflowVersion {
  workflow_id: string;
  version: number;
  definition: WorkflowDraftDefinition & { trigger: TriggerConfig };
  published_by: string | null;
  published_at: string;
}

export interface WorkflowStats {
  enrollments_active: number;
  enrollments_completed: number;
  enrollments_failed: number;
  enrollments_cancelled: number;
}

export interface WorkflowDetail {
  workflow: Workflow;
  active_version: WorkflowVersion | null;
  stats: WorkflowStats;
}

export interface Enrollment {
  id: string;
  workflow_id: string;
  workflow_version: number;
  lead_source_type: LeadSourceType;
  lead_source_id: string;
  lead_email_snapshot: string | null;
  lead_phone_snapshot: string | null;
  lead_name_snapshot: string | null;
  status: EnrollmentStatus;
  current_node_id: string | null;
  context: Record<string, unknown>;
  next_scheduled_at: string | null;
  enrolled_at: string;
  completed_at: string | null;
  error_reason: string | null;
  enrollment_source: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeadEvent {
  id: string;
  lead_source_type: LeadSourceType;
  lead_source_id: string;
  event_type: LeadEventType;
  occurred_at: string;
  enrollment_id: string | null;
  workflow_node_run_id: string | null;
  provider_message_id: string | null;
  payload: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowNodeRun {
  id: string;
  enrollment_id: string;
  node_id: string;
  attempt: number;
  status: NodeRunStatus;
  started_at: string;
  finished_at: string | null;
  output: Record<string, unknown>;
  provider_message_id: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// API response shapes
// ---------------------------------------------------------------------------

export interface WorkflowListResponse {
  items: Workflow[];
  total: number;
  page: number;
  limit: number;
}

export interface EnrollmentListResponse {
  items: Enrollment[];
  total: number;
  page: number;
  limit: number;
}

export interface ValidateResponse {
  valid: boolean;
  errors: string[];
}

export interface PublishResponse {
  message: string;
  workflow_id: string;
  version: number;
  published_at: string;
}

export interface RunResponse {
  message: string;
  workflow_id: string;
  run_id: string;
}
