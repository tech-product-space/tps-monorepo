import { Badge } from "@/components/ui/badge";
import type { WorkflowStatus, EnrollmentStatus, NodeRunStatus } from "@/types/workflow";

const WORKFLOW_STYLES: Record<WorkflowStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700 border-zinc-200",
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  paused: "bg-amber-100 text-amber-800 border-amber-200",
  archived: "bg-zinc-200 text-zinc-600 border-zinc-300",
};

const ENROLLMENT_STYLES: Record<EnrollmentStatus, string> = {
  active: "bg-sky-100 text-sky-700 border-sky-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  failed: "bg-rose-100 text-rose-700 border-rose-200",
  cancelled: "bg-zinc-200 text-zinc-600 border-zinc-300",
  paused: "bg-amber-100 text-amber-800 border-amber-200",
  waiting: "bg-cyan-100 text-cyan-700 border-cyan-200",
};

const NODE_RUN_STYLES: Record<NodeRunStatus, string> = {
  running: "bg-sky-100 text-sky-700 border-sky-200",
  completed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  failed: "bg-rose-100 text-rose-700 border-rose-200",
  skipped: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

export function WorkflowStatusBadge({ status }: { status: WorkflowStatus }) {
  return (
    <Badge variant="outline" className={WORKFLOW_STYLES[status]}>
      {status}
    </Badge>
  );
}

export function EnrollmentStatusBadge({ status }: { status: EnrollmentStatus }) {
  return (
    <Badge variant="outline" className={ENROLLMENT_STYLES[status]}>
      {status}
    </Badge>
  );
}

export function NodeRunStatusBadge({ status }: { status: NodeRunStatus }) {
  return (
    <Badge variant="outline" className={NODE_RUN_STYLES[status]}>
      {status}
    </Badge>
  );
}
