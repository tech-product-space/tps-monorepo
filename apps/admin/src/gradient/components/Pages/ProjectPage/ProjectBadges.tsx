"use client";

import { Badge } from "@/gradient/components/ui/badge";
import {
  PROJECT_LEVEL_LABELS,
  ProjectLevel,
  ProjectSource,
  ProjectStatus,
} from "@/gradient/types/project";

/**
 * The three badges a project row carries, in one file so the list, the detail
 * page and the submissions queue cannot describe the same row differently.
 */

const LEVEL_CLASS: Record<ProjectLevel, string> = {
  beginner: "bg-emerald-50 text-emerald-700 border-emerald-200",
  intermediate: "bg-amber-50 text-amber-700 border-amber-200",
  advanced: "bg-rose-50 text-rose-700 border-rose-200",
};

export function LevelBadge({ level }: { level?: ProjectLevel | null }) {
  if (!level) return <span className="text-muted-foreground">—</span>;

  return (
    <Badge variant="outline" className={LEVEL_CLASS[level]}>
      {PROJECT_LEVEL_LABELS[level]}
    </Badge>
  );
}

const STATUS_CLASS: Record<ProjectStatus, string> = {
  submitted: "bg-blue-50 text-blue-700 border-blue-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-rose-50 text-rose-700 border-rose-200",
};

const STATUS_LABEL: Record<ProjectStatus, string> = {
  submitted: "Awaiting review",
  approved: "Approved",
  rejected: "Rejected",
};

/**
 * Shown only for community rows on the main list.
 *
 * Every admin-created project is `approved` from birth, so a column of
 * identical green "Approved" badges would be noise that hides the one row that
 * actually needs looking at.
 */
export function StatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <Badge variant="outline" className={STATUS_CLASS[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}

export function SourceBadge({ source }: { source: ProjectSource }) {
  if (source === "admin") return <span className="text-muted-foreground">—</span>;

  return (
    <Badge
      variant="outline"
      className="border-violet-200 bg-violet-50 text-violet-700"
    >
      Community
    </Badge>
  );
}
