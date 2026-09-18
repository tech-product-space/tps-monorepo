"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Mail,
  Clock,
  Ban,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Hourglass,
  Flag,
  GitBranch,
  User as UserIcon,
  RefreshCw,
  ExternalLink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

import {
  enrollmentService,
  type TriggerSource,
} from "@/services/workflow/enrollmentService";
import { workflowService } from "@/services/workflow/workflowService";
import { useAutomationBasePath } from "@/hooks/useAutomationBasePath";
import type {
  Enrollment,
  LeadEvent,
  LeadEventType,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeRun,
  NodeType,
  SendEmailConfig,
  DelayConfig,
  GoalConfig,
} from "@/types/workflow";
import { formatDataTime } from "@/utils/formatDataTime";
import { EnrollmentStatusBadge } from "./WorkflowStatusBadge";

type Props = { enrollmentId: string };

type StepState =
  | "completed"
  | "failed"
  | "running"
  | "skipped"
  | "current"
  | "upcoming";

type BranchTag = "match" | "no_match" | "merged" | null;

type JourneyStep = {
  node: WorkflowNode;
  run: WorkflowNodeRun | null;
  state: StepState;
  position: number;
  events: LeadEvent[];
  branchTag: BranchTag;
};

// Recursive tree shape rendered as a vertical flowchart. Condition nodes fork
// into a yes/no branch; everything else continues in a single linear `next`.
type TreeStep = {
  step: JourneyStep;
  kind: "linear" | "condition";
  next?: TreeStep | null;
  yes?: TreeStep | null;
  no?: TreeStep | null;
  branchTaken?: "match" | "no_match" | null;
};

export default function EnrollmentDetailPage({ enrollmentId }: Props) {
  const router = useRouter();
  const basePath = useAutomationBasePath();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [workflowName, setWorkflowName] = useState<string>("");
  const [workflowId, setWorkflowId] = useState<string>("");
  const [triggerSource, setTriggerSource] = useState<TriggerSource | null>(null);
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [entryNodeId, setEntryNodeId] = useState<string | null>(null);
  const [runs, setRuns] = useState<WorkflowNodeRun[]>([]);
  const [events, setEvents] = useState<LeadEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const fetchData = async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      setError(null);

      const [detail, logs, evts] = await Promise.all([
        enrollmentService.get(enrollmentId),
        enrollmentService.logs(enrollmentId),
        enrollmentService.events(enrollmentId).catch(() => ({ events: [] as LeadEvent[] })),
      ]);
      setEnrollment(detail.enrollment);
      setWorkflowName(detail.workflow.name);
      setWorkflowId(detail.workflow.id);
      setTriggerSource(detail.trigger_source || null);
      setRuns(logs.node_runs);
      setEvents(evts.events || []);

      // Fetch workflow definition so we can show readable step names.
      // We prefer the version pinned to the enrollment if it's still the
      // currently-active version; otherwise we fall back to the draft, which
      // is rarely meaningfully different in practice.
      try {
        const wf = await workflowService.get(detail.workflow.id);
        const def =
          wf.active_version?.definition || wf.workflow.draft_definition;
        setNodes(def?.nodes || []);
        setEdges(def?.edges || []);
        setEntryNodeId(def?.entry_node_id ?? null);
      } catch {
        // Workflow definition is a nice-to-have; runs alone still render.
        setNodes([]);
        setEdges([]);
        setEntryNodeId(null);
      }
    } catch (e) {
      console.error(e);
      setError("Failed to load enrollment");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollmentId]);

  // Auto-refresh while the enrollment is still moving — quietly, every 10s,
  // so the admin can watch a workflow run live without manual refresh.
  useEffect(() => {
    if (!enrollment) return;
    if (enrollment.status !== "active" && enrollment.status !== "paused") return;
    const t = setInterval(() => fetchData(true), 10000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollment?.status, enrollmentId]);

  const handleCancel = async () => {
    try {
      setCancelling(true);
      await enrollmentService.cancel(enrollmentId, "cancelled_from_ui");
      toast.success("Enrollment cancelled");
      fetchData();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to cancel");
    } finally {
      setCancelling(false);
    }
  };

  const journey = useMemo<JourneyStep[]>(() => {
    if (!enrollment) return [];

    const runByNodeId = new Map<string, WorkflowNodeRun>();
    for (const r of runs) {
      const prev = runByNodeId.get(r.node_id);
      if (!prev || r.attempt > prev.attempt) runByNodeId.set(r.node_id, r);
    }

    const eventsByRunId = new Map<string, LeadEvent[]>();
    for (const ev of events) {
      if (!ev.workflow_node_run_id) continue;
      const arr = eventsByRunId.get(ev.workflow_node_run_id) || [];
      arr.push(ev);
      eventsByRunId.set(ev.workflow_node_run_id, arr);
    }

    const currentIdx = enrollment.current_node_id
      ? nodes.findIndex((n) => n.id === enrollment.current_node_id)
      : -1;

    const branchByNode = computeBranchTags(nodes, edges);

    const baseSteps: JourneyStep[] = nodes.map((node, position) => {
      const run = runByNodeId.get(node.id) || null;
      let state: StepState;
      if (run) {
        state = run.status as StepState;
      } else if (
        position === currentIdx &&
        (enrollment.status === "active" || enrollment.status === "paused")
      ) {
        state = "current";
      } else {
        state = "upcoming";
      }
      const stepEvents = run ? eventsByRunId.get(run.id) || [] : [];
      return {
        node,
        run,
        state,
        position,
        events: stepEvents,
        branchTag: branchByNode.get(node.id) ?? null,
      };
    });

    if (nodes.length > 0) {
      const knownIds = new Set(nodes.map((n) => n.id));
      const orphans = runs
        .filter((r) => !knownIds.has(r.node_id))
        .map((r, i) => ({
          node: {
            id: r.node_id,
            type: "action.send_email" as NodeType,
            config: {} as any,
          },
          run: r,
          state: r.status as StepState,
          position: baseSteps.length + i,
          events: eventsByRunId.get(r.id) || [],
          branchTag: null as BranchTag,
        }));
      return [...baseSteps, ...orphans];
    }

    return runs
      .slice()
      .sort(
        (a, b) =>
          new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
      )
      .map((r, i) => ({
        node: {
          id: r.node_id,
          type: "action.send_email" as NodeType,
          config: {} as any,
        },
        run: r,
        state: r.status as StepState,
        position: i,
        events: eventsByRunId.get(r.id) || [],
        branchTag: null as BranchTag,
      }));
  }, [enrollment, nodes, edges, runs, events]);

  const { tree, unreached } = useMemo<{
    tree: TreeStep | null;
    unreached: JourneyStep[];
  }>(() => {
    if (journey.length === 0) return { tree: null, unreached: [] };
    return buildJourneyTreeRecursive(journey, edges, entryNodeId, nodes);
  }, [journey, edges, entryNodeId, nodes]);

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !enrollment) {
    return (
      <div className="text-center py-16 text-destructive">
        {error || "Enrollment not found"}
      </div>
    );
  }

  const canCancel =
    enrollment.status === "active" || enrollment.status === "paused";

  const completedCount = journey.filter((s) => s.state === "completed").length;
  const totalCount = journey.length;

  return (
    <div className="space-y-6 h-full overflow-y-auto pb-12">
      {/* ─── Header: identity + status + actions ───────────────────────── */}
      <div className="px-8 py-5 border-b">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              className="mt-1"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>

            <LeadAvatar
              name={enrollment.lead_name_snapshot}
              email={enrollment.lead_email_snapshot}
            />

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold truncate">
                  {enrollment.lead_name_snapshot ||
                    enrollment.lead_email_snapshot ||
                    "Unknown lead"}
                </h1>
                <EnrollmentStatusBadge status={enrollment.status} />
              </div>
              <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 mt-1">
                {enrollment.lead_email_snapshot && (
                  <span className="truncate">
                    {enrollment.lead_email_snapshot}
                  </span>
                )}
                {enrollment.lead_phone_snapshot && (
                  <>
                    <span className="text-zinc-300">·</span>
                    <span>{enrollment.lead_phone_snapshot}</span>
                  </>
                )}
                <span className="text-zinc-300">·</span>
                <span>
                  {triggerSource?.label ||
                    describeSource(enrollment.lead_source_type)}
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-2">
                In workflow:{" "}
                <button
                  className="text-primary hover:underline inline-flex items-center gap-1"
                  onClick={() =>
                    router.push(`${basePath}/automation/workflows/${workflowId}`)
                  }
                >
                  {workflowName}
                  <ExternalLink className="h-3 w-3" />
                </button>{" "}
                <span className="text-zinc-400">
                  · v{enrollment.workflow_version}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => fetchData(true)}
              disabled={refreshing}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 mr-2 ${
                  refreshing ? "animate-spin" : ""
                }`}
              />
              Refresh
            </Button>
            {canCancel && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={cancelling}>
                    <Ban className="h-4 w-4 mr-2" />
                    Cancel enrollment
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel enrollment</AlertDialogTitle>
                    <AlertDialogDescription>
                      This stops further steps from running for this lead.
                      Already-sent messages are not affected.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Back</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleCancel}
                      className="bg-destructive text-white hover:bg-destructive/90"
                    >
                      Cancel enrollment
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Compact stat strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <StatBlock
            label="Progress"
            value={
              totalCount > 0 ? `${completedCount} / ${totalCount}` : "—"
            }
            hint={totalCount > 0 ? "steps completed" : "no steps yet"}
          />
          <StatBlock
            label="Started"
            value={formatRelative(enrollment.enrolled_at)}
            hint={formatDataTime(enrollment.enrolled_at)}
          />
          <StatBlock
            label={
              enrollment.status === "completed"
                ? "Finished"
                : enrollment.next_scheduled_at
                ? "Next step"
                : "Last update"
            }
            value={
              enrollment.completed_at
                ? formatRelative(enrollment.completed_at)
                : enrollment.next_scheduled_at
                ? formatRelative(enrollment.next_scheduled_at)
                : formatRelative(enrollment.updatedAt)
            }
            hint={
              enrollment.completed_at
                ? formatDataTime(enrollment.completed_at)
                : enrollment.next_scheduled_at
                ? formatDataTime(enrollment.next_scheduled_at)
                : formatDataTime(enrollment.updatedAt)
            }
          />
          <StatBlock
            label="Trigger"
            value={triggerSource?.label || enrollment.enrollment_source || "auto"}
            hint={describeTriggerHint(triggerSource, enrollment)}
          />
        </div>

        {enrollment.error_reason && (
          <div className="mt-4 flex items-start gap-2 bg-rose-50 border border-rose-200 rounded-md p-3 text-sm text-rose-800">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Workflow failed for this lead</div>
              <div className="text-rose-700 break-words">
                {enrollment.error_reason}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Journey timeline ──────────────────────────────────────────── */}
      <div className="px-8">
        <h2 className="text-base font-semibold mb-1">Lead journey</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Each step the workflow runs for this lead. Click a step to see details.
        </p>

        {journey.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground text-sm">
              <Hourglass className="h-6 w-6 mx-auto mb-2 opacity-50" />
              The worker hasn't picked this enrollment up yet — check back in a
              few seconds.
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-x-auto pb-6">
            <div className="flex flex-col items-center min-w-fit py-2">
              {tree ? <TreeView tree={tree} /> : null}
            </div>
            {unreached.length > 0 && (
              <div className="mt-8 pt-6 border-t">
                <div className="text-[11px] uppercase tracking-wide font-semibold text-muted-foreground mb-3">
                  Not reachable from trigger
                </div>
                <div className="flex flex-col items-center gap-3">
                  {unreached.map((s) => (
                    <StepCard
                      key={`${s.node.id}-${s.run?.attempt ?? "x"}`}
                      step={s}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Identity helpers
// ──────────────────────────────────────────────────────────────────────────

function LeadAvatar({
  name,
  email,
}: {
  name: string | null;
  email: string | null;
}) {
  const initials = computeInitials(name, email);
  return (
    <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-base font-semibold shrink-0">
      {initials || <UserIcon className="h-5 w-5" />}
    </div>
  );
}

function computeInitials(
  name: string | null,
  email: string | null
): string {
  const src = (name || email || "").trim();
  if (!src) return "";
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

const SOURCE_LABEL: Record<string, string> = {
  platform_leads: "Website form",
  external_leads: "External lead",
  events: "Event signup",
  resources: "Resource download",
  users: "User account",
  contact_list: "Contact list",
};
function describeSource(t: string): string {
  return SOURCE_LABEL[t] || t;
}

function describeTriggerHint(
  ts: TriggerSource | null,
  enrollment: Enrollment
): string {
  if (!ts) return `Lead id: ${enrollment.lead_source_id}`;
  if (ts.kind === "static_list") {
    return ts.run_id
      ? `Static list run · ${ts.run_id}`
      : "Static list run";
  }
  if (ts.kind === "manual") {
    return `Manually enrolled · lead id ${enrollment.lead_source_id}`;
  }
  // new_lead
  return `Realtime trigger · lead id ${enrollment.lead_source_id}`;
}

// ──────────────────────────────────────────────────────────────────────────
// Stat blocks
// ──────────────────────────────────────────────────────────────────────────

function StatBlock({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">
        {label}
      </div>
      <div className="text-sm font-semibold mt-0.5 truncate">{value}</div>
      {hint && (
        <div className="text-[11px] text-muted-foreground truncate">{hint}</div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Timeline row
// ──────────────────────────────────────────────────────────────────────────

const NODE_ICONS: Record<NodeType, React.ComponentType<any>> = {
  "action.send_email": Mail,
  "action.send_whatsapp": Mail,
  "control.delay": Clock,
  "control.condition": GitBranch,
  "control.ab_split": AlertCircle,
  "control.goal": Flag,
};

const STATE_THEME: Record<
  StepState,
  { dot: string; ring: string; chipBg: string; chipText: string; chipLabel: string }
> = {
  completed: {
    dot: "bg-emerald-500 text-white",
    ring: "ring-emerald-100",
    chipBg: "bg-emerald-50 border-emerald-200",
    chipText: "text-emerald-700",
    chipLabel: "Done",
  },
  failed: {
    dot: "bg-rose-500 text-white",
    ring: "ring-rose-100",
    chipBg: "bg-rose-50 border-rose-200",
    chipText: "text-rose-700",
    chipLabel: "Failed",
  },
  running: {
    dot: "bg-sky-500 text-white",
    ring: "ring-sky-100",
    chipBg: "bg-sky-50 border-sky-200",
    chipText: "text-sky-700",
    chipLabel: "Running",
  },
  skipped: {
    dot: "bg-amber-500 text-white",
    ring: "ring-amber-100",
    chipBg: "bg-amber-50 border-amber-200",
    chipText: "text-amber-800",
    chipLabel: "Skipped",
  },
  current: {
    dot: "bg-primary text-primary-foreground animate-pulse",
    ring: "ring-primary/20",
    chipBg: "bg-primary/10 border-primary/20",
    chipText: "text-primary",
    chipLabel: "Up next",
  },
  upcoming: {
    dot: "bg-white text-zinc-400 border-2 border-zinc-200",
    ring: "ring-transparent",
    chipBg: "bg-zinc-50 border-zinc-200",
    chipText: "text-zinc-500",
    chipLabel: "Upcoming",
  },
};

function StepCard({ step }: { step: JourneyStep }) {
  const [open, setOpen] = useState(false);

  const Icon = NODE_ICONS[step.node.type] || Mail;
  const theme = STATE_THEME[step.state];
  const title = stepTitle(step.node);
  const summary = stepSummary(step.node);

  const hasDetails =
    !!step.run?.error ||
    !!step.run?.provider_message_id ||
    Object.keys(step.run?.output || {}).length > 0 ||
    step.events.length > 0;

  const dimmed = step.state === "upcoming";

  const sortedEvents = [...step.events].sort(
    (a, b) =>
      new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
  );
  const eventChips = summarizeEventChips(sortedEvents);
  const branchChip =
    step.node.type === "control.condition" && step.run?.output
      ? conditionBranchChip(step.run.output as any)
      : null;

  return (
    <div
      className={`w-64 rounded-lg border p-3 shadow-sm transition ${
        dimmed
          ? "border-zinc-200 bg-white/60"
          : step.state === "current"
          ? "border-primary/40 bg-primary/5"
          : "border-zinc-200 bg-white"
      } ${hasDetails ? "cursor-pointer hover:shadow-md" : ""}`}
      onClick={() => hasDetails && setOpen((o) => !o)}
    >
      <div className="flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-md shrink-0 ${theme.dot}`}
        >
          {iconForState(step.state, Icon)}
        </span>
        <span
          className={`font-medium text-sm truncate flex-1 ${
            dimmed ? "text-muted-foreground" : ""
          }`}
          title={title}
        >
          {title}
        </span>
        <span
          className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border shrink-0 ${theme.chipBg} ${theme.chipText}`}
        >
          {theme.chipLabel}
        </span>
      </div>

      {summary && (
        <div className="text-xs text-muted-foreground mt-1.5 truncate">
          {summary}
        </div>
      )}
      <div className="text-[11px] text-muted-foreground mt-1">
        {timingLabel(step)}
      </div>
      {step.run?.attempt && step.run.attempt > 1 && (
        <div className="text-[11px] text-muted-foreground mt-0.5">
          attempt #{step.run.attempt}
        </div>
      )}

      {(eventChips.length > 0 || branchChip) && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {branchChip && (
            <span
              className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${branchChip.cls}`}
            >
              {branchChip.label}
            </span>
          )}
          {eventChips.map((c) => (
            <span
              key={c.label}
              className={`text-[11px] px-1.5 py-0.5 rounded border ${c.cls}`}
              title={c.title}
            >
              {c.icon} {c.label}
            </span>
          ))}
        </div>
      )}

      {step.run?.error && (
        <div className="text-xs text-rose-700 mt-1.5 bg-rose-50 border border-rose-100 rounded px-2 py-1 break-words">
          {step.run.error}
        </div>
      )}

      {hasDetails && (
        <div className="mt-2 pt-2 border-t flex items-center justify-end">
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
            {open ? (
              <>
                Hide details
                <ChevronDown className="h-3.5 w-3.5" />
              </>
            ) : (
              <>
                Show details
                <ChevronRight className="h-3.5 w-3.5" />
              </>
            )}
          </span>
        </div>
      )}

      {open && hasDetails && (
        <div className="mt-2 pt-2 border-t space-y-2 text-xs">
          {sortedEvents.length > 0 && (
            <div>
              <div className="text-muted-foreground mb-1">Activity</div>
              <ul className="space-y-1">
                {sortedEvents.map((ev) => (
                  <li key={ev.id} className="flex items-center gap-2">
                    <span
                      className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${
                        EVENT_DOT_COLOR[ev.event_type] || "bg-zinc-400"
                      }`}
                    />
                    <span className="font-medium">
                      {humanizeEventType(ev.event_type)}
                    </span>
                    <span className="text-muted-foreground">
                      — {formatRelative(ev.occurred_at)}
                    </span>
                    {ev.event_type === "email.clicked" &&
                      typeof (ev.payload as any)?.url === "string" && (
                        <a
                          href={(ev.payload as any).url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary truncate max-w-[200px]"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {(ev.payload as any).url}
                        </a>
                      )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {step.run?.provider_message_id && (
            <div>
              <span className="text-muted-foreground">Provider msg: </span>
              <code className="text-[11px] break-all">
                {step.run.provider_message_id}
              </code>
            </div>
          )}
          {Object.keys(step.run?.output || {}).length > 0 && (
            <div>
              <div className="text-muted-foreground mb-1">Output</div>
              <pre className="bg-muted/40 rounded p-2 overflow-x-auto text-[11px]">
                {JSON.stringify(step.run!.output, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Vertical-tree layout: a step + (linear next | yes/no branches)
// ──────────────────────────────────────────────────────────────────────────

function TreeView({ tree }: { tree: TreeStep }) {
  return (
    <div className="flex flex-col items-center">
      <StepCard step={tree.step} />
      {tree.kind === "condition" ? (
        <>
          <Connector />
          <BranchSplit
            yes={tree.yes ?? null}
            no={tree.no ?? null}
            taken={tree.branchTaken ?? null}
          />
        </>
      ) : tree.next ? (
        <>
          <Connector />
          <TreeView tree={tree.next} />
        </>
      ) : null}
    </div>
  );
}

function Connector() {
  return <div className="h-6 w-px bg-zinc-300" aria-hidden />;
}

function BranchSplit({
  yes,
  no,
  taken,
}: {
  yes: TreeStep | null;
  no: TreeStep | null;
  taken: "match" | "no_match" | null;
}) {
  return (
    <div className="flex items-start gap-10">
      <BranchColumn
        kind="yes"
        tree={yes}
        taken={taken === null ? null : taken === "match"}
      />
      <BranchColumn
        kind="no"
        tree={no}
        taken={taken === null ? null : taken === "no_match"}
      />
    </div>
  );
}

function BranchColumn({
  kind,
  tree,
  taken,
}: {
  kind: "yes" | "no";
  tree: TreeStep | null;
  taken: boolean | null;
}) {
  const isYes = kind === "yes";
  const labelClass = isYes
    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
    : "bg-rose-50 border-rose-200 text-rose-700";
  const ring =
    taken === true
      ? "ring-2 ring-offset-1 " + (isYes ? "ring-emerald-300" : "ring-rose-300")
      : "";
  const dim = taken === false ? "opacity-60" : "";
  const status =
    taken === true ? "taken" : taken === false ? "not taken" : "";

  return (
    <div className={`flex flex-col items-center ${dim}`}>
      <div
        className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full border ${labelClass} ${ring}`}
      >
        <span>{isYes ? "✓ YES" : "✗ NO"}</span>
        {status && (
          <span className="text-zinc-500 font-normal">· {status}</span>
        )}
      </div>
      {tree ? (
        <>
          <Connector />
          <TreeView tree={tree} />
        </>
      ) : (
        <div className="mt-2 text-[11px] text-muted-foreground italic">
          (no steps)
        </div>
      )}
    </div>
  );
}

function iconForState(state: StepState, FallbackIcon: React.ComponentType<any>) {
  if (state === "completed") return <CheckCircle2 className="h-4 w-4" />;
  if (state === "failed") return <XCircle className="h-4 w-4" />;
  if (state === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  if (state === "skipped") return <AlertCircle className="h-4 w-4" />;
  return <FallbackIcon className="h-3.5 w-3.5" />;
}

function stepTitle(node: WorkflowNode): string {
  const c: any = node.config || {};
  switch (node.type) {
    case "action.send_email":
      return `Send email${
        (c as SendEmailConfig).subject
          ? ` — "${(c as SendEmailConfig).subject}"`
          : ""
      }`;
    case "action.send_whatsapp":
      return "Send WhatsApp";
    case "control.delay": {
      const d = c as DelayConfig;
      return d.duration_value
        ? `Wait ${d.duration_value} ${d.duration_unit}`
        : "Wait";
    }
    case "control.goal":
      return `Exit${
        (c as GoalConfig).goal_name ? `: ${(c as GoalConfig).goal_name}` : ""
      }`;
    case "control.condition": {
      const w = c as { event_type?: string; timeout_value?: number; timeout_unit?: string };
      if (w.event_type && w.timeout_value && w.timeout_unit) {
        return `If / then — ${w.event_type} within ${w.timeout_value} ${w.timeout_unit}`;
      }
      return "If / then";
    }
    case "control.ab_split":
      return "A/B split";
    default:
      return node.id;
  }
}

function stepSummary(node: WorkflowNode): string | null {
  const c: any = node.config || {};
  if (node.type === "action.send_email") {
    const cfg = c as SendEmailConfig;
    return [cfg.from_name, cfg.from_email].filter(Boolean).join(" · ") || null;
  }
  return null;
}

function timingLabel(step: JourneyStep): string {
  const { run, state } = step;
  if (run) {
    if (state === "completed" && run.finished_at) {
      return `Completed ${formatRelative(run.finished_at)} · ran for ${duration(
        run.started_at,
        run.finished_at
      )}`;
    }
    if (state === "failed" && run.finished_at) {
      return `Failed ${formatRelative(run.finished_at)}`;
    }
    if (state === "running") {
      return `Running since ${formatRelative(run.started_at)}`;
    }
    if (state === "skipped") {
      const reason =
        (run.output && (run.output as any).reason) ||
        run.error ||
        null;
      const pretty = reason ? humanizeSkipReason(String(reason)) : null;
      return pretty
        ? `Skipped ${formatRelative(run.started_at)} — ${pretty}`
        : `Skipped ${formatRelative(run.started_at)}`;
    }
    return formatDataTime(run.started_at);
  }
  if (state === "current") return "Waiting for the engine to pick this up";
  return "Hasn't run yet";
}

function buildJourneyTreeRecursive(
  journey: JourneyStep[],
  edges: WorkflowEdge[],
  entryNodeId: string | null,
  defNodes: WorkflowNode[]
): { tree: TreeStep | null; unreached: JourneyStep[] } {
  const byId = new Map(journey.map((s) => [s.node.id, s]));
  if (journey.length === 0) return { tree: null, unreached: [] };

  const start =
    (entryNodeId && byId.has(entryNodeId) && entryNodeId) ||
    pickTopologicalEntry(defNodes, edges) ||
    journey[0]?.node.id ||
    null;
  if (!start) return { tree: null, unreached: journey };

  const visited = new Set<string>();
  const visit = (nodeId: string): TreeStep | null => {
    if (visited.has(nodeId)) return null;
    visited.add(nodeId);
    const step = byId.get(nodeId);
    if (!step) return null;

    const outgoing = edges.filter((e) => e.from === nodeId);

    if (step.node.type === "control.condition") {
      const yesEdge = outgoing.find((e) => e.label === "match");
      const noEdge = outgoing.find((e) => e.label === "no_match");
      const chosen =
        ((step.run?.output as any)?.branch as
          | "match"
          | "no_match"
          | undefined) || null;
      return {
        step,
        kind: "condition",
        yes: yesEdge ? visit(yesEdge.to) : null,
        no: noEdge ? visit(noEdge.to) : null,
        branchTaken: chosen,
      };
    }

    const next = outgoing[0];
    return {
      step,
      kind: "linear",
      next: next ? visit(next.to) : null,
    };
  };

  const tree = visit(start);
  const unreached = journey.filter((s) => !visited.has(s.node.id));
  return { tree, unreached };
}

function pickTopologicalEntry(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): string | null {
  if (nodes.length === 0) return null;
  const hasIncoming = new Set(edges.map((e) => e.to));
  const entry = nodes.find(
    (n) => !hasIncoming.has(n.id) && n.type !== "control.goal"
  );
  return entry?.id ?? null;
}

function computeBranchTags(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[]
): Map<string, BranchTag> {
  const tags = new Map<string, BranchTag>();
  if (nodes.length === 0 || edges.length === 0) return tags;

  type Frontier = { nodeId: string; tag: "match" | "no_match" };
  const queue: Frontier[] = [];

  for (const e of edges) {
    if (e.label === "match" || e.label === "no_match") {
      queue.push({ nodeId: e.to, tag: e.label });
    }
  }

  const visited = new Set<string>();
  while (queue.length > 0) {
    const { nodeId, tag } = queue.shift()!;
    const key = `${nodeId}:${tag}`;
    if (visited.has(key)) continue;
    visited.add(key);

    const prior = tags.get(nodeId);
    if (prior && prior !== tag && prior !== "merged") {
      tags.set(nodeId, "merged");
    } else if (!prior) {
      tags.set(nodeId, tag);
    }

    for (const e of edges) {
      if (e.from !== nodeId) continue;
      if (e.label === "match" || e.label === "no_match") continue;
      queue.push({ nodeId: e.to, tag });
    }
  }

  return tags;
}

function humanizeSkipReason(raw: string): string {
  if (raw === "no_recipient_email") return "lead has no email address";
  if (raw === "no_recipient_phone") return "lead has no phone number";
  if (raw === "lead_opted_out_email") return "lead opted out of email";
  if (raw.startsWith("workflow_status:")) {
    return `workflow ${raw.split(":")[1] || "inactive"}`;
  }
  return raw.replace(/_/g, " ");
}

function duration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const future = ms < 0;
  const abs = Math.abs(ms);
  let label: string;
  if (abs < 60_000) label = "just now";
  else if (abs < 3_600_000) label = `${Math.round(abs / 60_000)}m`;
  else if (abs < 86_400_000) label = `${Math.round(abs / 3_600_000)}h`;
  else label = `${Math.round(abs / 86_400_000)}d`;
  if (label === "just now") return label;
  return future ? `in ${label}` : `${label} ago`;
}

// ──────────────────────────────────────────────────────────────────────────
// Event chips + helpers
// ──────────────────────────────────────────────────────────────────────────

const EVENT_DOT_COLOR: Record<LeadEventType, string> = {
  "email.sent": "bg-zinc-400",
  "email.opened": "bg-sky-500",
  "email.clicked": "bg-violet-500",
  "email.bounced": "bg-rose-500",
  "email.complained": "bg-rose-600",
  "email.unsubscribed": "bg-amber-500",
  "goal.reached": "bg-emerald-500",
};

const EVENT_CHIP_STYLE: Record<LeadEventType, string> = {
  "email.sent": "bg-zinc-50 border-zinc-200 text-zinc-700",
  "email.opened": "bg-sky-50 border-sky-200 text-sky-700",
  "email.clicked": "bg-violet-50 border-violet-200 text-violet-700",
  "email.bounced": "bg-rose-50 border-rose-200 text-rose-700",
  "email.complained": "bg-rose-100 border-rose-300 text-rose-800",
  "email.unsubscribed": "bg-amber-50 border-amber-200 text-amber-800",
  "goal.reached": "bg-emerald-50 border-emerald-200 text-emerald-700",
};

function humanizeEventType(t: LeadEventType): string {
  switch (t) {
    case "email.sent": return "Email sent";
    case "email.opened": return "Opened";
    case "email.clicked": return "Clicked a link";
    case "email.bounced": return "Bounced";
    case "email.complained": return "Marked as spam";
    case "email.unsubscribed": return "Unsubscribed";
    case "goal.reached": return "Goal reached";
    default: return t;
  }
}

function summarizeEventChips(events: LeadEvent[]) {
  // Roll up counts per event type — most senders don't care about each repeat.
  const counts = new Map<LeadEventType, number>();
  const last = new Map<LeadEventType, string>();
  for (const e of events) {
    if (e.event_type === "email.sent") continue; // implicit from the step itself
    counts.set(e.event_type, (counts.get(e.event_type) || 0) + 1);
    last.set(e.event_type, e.occurred_at);
  }
  const out: Array<{ label: string; cls: string; icon: string; title: string }> = [];
  const order: LeadEventType[] = [
    "email.opened",
    "email.clicked",
    "email.bounced",
    "email.complained",
    "email.unsubscribed",
  ];
  for (const t of order) {
    const n = counts.get(t);
    if (!n) continue;
    const lbl = humanizeEventType(t);
    out.push({
      label: n > 1 ? `${lbl} (${n})` : lbl,
      cls: EVENT_CHIP_STYLE[t],
      icon: EVENT_EMOJI[t] || "•",
      title: `Last: ${formatDataTime(last.get(t)!)}`,
    });
  }
  return out;
}

const EVENT_EMOJI: Partial<Record<LeadEventType, string>> = {
  "email.opened": "👁",
  "email.clicked": "🔗",
  "email.bounced": "↩",
  "email.complained": "⚠",
  "email.unsubscribed": "✖",
};

function conditionBranchChip(output: { branch?: string; matched?: boolean }):
  | { label: string; cls: string }
  | null {
  if (!output || (!output.branch && output.matched === undefined)) return null;
  const matched = output.matched === true || output.branch === "match";
  return matched
    ? { label: "Yes — event happened in time", cls: "bg-emerald-50 border-emerald-200 text-emerald-700" }
    : { label: "No — timed out", cls: "bg-amber-50 border-amber-200 text-amber-800" };
}

