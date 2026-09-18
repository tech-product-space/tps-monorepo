"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { ListChecks, Zap } from "lucide-react";

import type { Workflow, TriggerConfig } from "@/types/workflow";
import { workflowService } from "@/services/workflow/workflowService";

import StaticListTrigger from "./triggers/StaticListTrigger";
import NewLeadTrigger from "./triggers/NewLeadTrigger";
import InfoHint from "../InfoHint";

type Props = {
  workflow: Workflow;
  onChanged: () => void;
  readOnly: boolean;
};

type TriggerType = "trigger.static_list" | "trigger.new_lead";

const OPTIONS: Array<{
  value: TriggerType;
  label: string;
  description: string;
  icon: React.ComponentType<any>;
}> = [
  {
    value: "trigger.static_list",
    label: "Static list",
    description:
      "Manual one-time bulk run. Pick recipients, hit Run, leads enroll.",
    icon: ListChecks,
  },
  {
    value: "trigger.new_lead",
    label: "When a new lead arrives",
    description:
      "Real-time auto-enroll when a lead is created from watched sources.",
    icon: Zap,
  },
];

export default function WorkflowTriggerTab({
  workflow,
  onChanged,
  readOnly,
}: Props) {
  const currentType = workflow.trigger_config?.type || null;
  const [pendingType, setPendingType] = useState<TriggerType | null>(null);

  const switchType = async (next: TriggerType) => {
    setPendingType(null);
    let nextConfig: TriggerConfig;
    if (next === "trigger.static_list") {
      nextConfig = {
        type: "trigger.static_list",
        config: {
          recipient_filter: { sources: [] },
          batch_size: 100,
          scheduled_at: null,
        },
      };
    } else {
      nextConfig = {
        type: "trigger.new_lead",
        config: {
          recipient_filter: { sources: [] },
          allow_re_enrollment: false,
        },
      };
    }
    try {
      await workflowService.update(workflow.id, { trigger_config: nextConfig });
      onChanged();
    } catch (e) {
      console.error("Failed to switch trigger type", e);
    }
  };

  const handleSelect = (next: TriggerType) => {
    if (readOnly) return;
    if (currentType === next) return;
    // Switching wipes filter/settings. Confirm if there's existing config.
    if (currentType && workflow.trigger_config?.config?.recipient_filter) {
      setPendingType(next);
    } else {
      switchType(next);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-1.5">
            <Label className="text-base font-semibold">Trigger type</Label>
            <InfoHint>
              Decides who enters the workflow. <strong>Static list</strong>{" "}
              enrolls a fixed batch when you click Run.{" "}
              <strong>When a new lead arrives</strong> auto-enrolls in real time
              from watched website forms/events.
            </InfoHint>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {OPTIONS.map((o) => {
              const selected = currentType === o.value;
              const Icon = o.icon;
              return (
                <button
                  key={o.value}
                  type="button"
                  disabled={readOnly}
                  onClick={() => handleSelect(o.value)}
                  className={`
                    text-left p-4 rounded-lg border-2 transition
                    ${selected
                      ? "border-primary bg-primary/5"
                      : "border-zinc-200 hover:border-zinc-300"}
                    ${readOnly ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}
                  `}
                >
                  <div className="flex items-center gap-3 mb-1">
                    <Icon className="h-5 w-5" />
                    <span className="font-medium">{o.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {o.description}
                  </p>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {currentType === "trigger.static_list" && (
        <StaticListTrigger
          workflow={workflow}
          onChanged={onChanged}
          readOnly={readOnly}
        />
      )}

      {currentType === "trigger.new_lead" && (
        <NewLeadTrigger
          workflow={workflow}
          onChanged={onChanged}
          readOnly={readOnly}
        />
      )}

      {!currentType && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Pick a trigger type above to continue.
          </CardContent>
        </Card>
      )}

      {/* Confirmation when switching wipes existing config */}
      <AlertDialog
        open={!!pendingType}
        onOpenChange={(o) => !o && setPendingType(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch trigger type?</AlertDialogTitle>
            <AlertDialogDescription>
              Your current recipient filter and trigger settings will be reset.
              The workflow nodes/edges stay intact.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => pendingType && switchType(pendingType)}
            >
              Switch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
