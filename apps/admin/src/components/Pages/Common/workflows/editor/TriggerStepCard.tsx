"use client";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Zap,
  ListChecks,
  AlertCircle,
  ChevronRight,
  Bolt,
} from "lucide-react";
import type { Workflow } from "@/types/workflow";

type Props = {
  workflow: Workflow;
  onClick: () => void;
};

/**
 * Top card in the editor stepper that represents the workflow's trigger.
 * Visually matches SortableNodeCard but is not draggable / deletable, and
 * clicking it jumps to the Trigger tab instead of opening the side panel.
 */
export default function TriggerStepCard({ workflow, onClick }: Props) {
  const trigger = workflow.trigger_config;
  const type = trigger?.type;
  const sources = trigger?.config?.recipient_filter?.sources || [];
  const count = countSources(sources);

  const view = resolveView(type, count);

  return (
    <Card
      onClick={onClick}
      className={`
        flex items-center gap-4 p-4 cursor-pointer transition-all
        border-2 border-dashed ${view.ring}
        hover:shadow-md
        ${view.bg}
      `}
    >
      <div
        className={`flex items-center justify-center h-12 w-12 rounded-lg shrink-0 ${view.iconBg}`}
      >
        <view.Icon className="h-6 w-6" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-base">Trigger</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-sm font-medium truncate">{view.title}</span>
          {!type && (
            <Badge
              variant="outline"
              className="bg-amber-100 text-amber-800 border-amber-200 text-xs"
            >
              <AlertCircle className="h-3 w-3 mr-1" />
              not set
            </Badge>
          )}
        </div>
        <div className="text-sm text-muted-foreground truncate mt-0.5">
          {view.subtitle}
        </div>
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </Card>
  );
}

function resolveView(type: string | undefined, count: number) {
  if (!type) {
    return {
      Icon: Bolt,
      title: "Pick what fires this workflow",
      subtitle: "Click to choose a trigger — required before publishing",
      iconBg: "bg-amber-100 text-amber-700",
      ring: "border-amber-300 hover:border-amber-400",
      bg: "bg-amber-50/40",
    };
  }
  if (type === "trigger.new_lead") {
    return {
      Icon: Zap,
      title: "Realtime — new lead",
      subtitle:
        count === 0
          ? "No sources picked yet — click to configure"
          : `Auto-enrolls from ${count} source${count > 1 ? "s" : ""}`,
      iconBg: "bg-emerald-100 text-emerald-700",
      ring: "border-emerald-300 hover:border-emerald-400",
      bg: "bg-emerald-50/40",
    };
  }
  return {
    Icon: ListChecks,
    title: "Static list — run on demand",
    subtitle:
      count === 0
        ? "No recipients picked yet — click to configure"
        : `${count} source${count > 1 ? "s" : ""} selected`,
    iconBg: "bg-sky-100 text-sky-700",
    ring: "border-sky-300 hover:border-sky-400",
    bg: "bg-sky-50/40",
  };
}

function countSources(sources: any[]): number {
  let n = 0;
  for (const s of sources) {
    if (s.type === "platform_leads") {
      const types = (s.filters?.programs || []).flatMap(
        (p: any) => p.types || []
      );
      n += types.length;
    } else if (s.type === "events") {
      n += Object.keys(s.filters?.eventFilters || {}).length;
    } else if (s.type === "resources") {
      n += Object.keys(s.filters?.resourceFilters || {}).length;
    } else if (s.type === "users") {
      n += 1;
    } else if (s.type === "external_leads") {
      const metaSrcs = s.filters?.sources || [];
      let formCount = 0;
      for (const ms of metaSrcs) formCount += ms.form_ids?.length || 0;
      n += formCount || 1; // wildcard counts as one source
    } else if (s.type === "contact_list") {
      n += 1;
    }
  }
  return n;
}
