"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import WebsiteFormPicker from "./WebsiteFormPicker";
import { Eye, Pencil, Zap } from "lucide-react";
import InfoHint from "../../InfoHint";
import type {
  NewLeadTriggerConfig,
  Workflow,
} from "@/types/workflow";
import { workflowService } from "@/services/workflow/workflowService";

type Props = {
  workflow: Workflow;
  onChanged: () => void;
  readOnly: boolean;
};

const SUPPORTED_NOTE =
  "Pick the website forms, events, resources, or Meta ad forms to listen on. " +
  "A matching submission auto-enrolls the lead within seconds " +
  "(Meta leads enroll as each sync brings them in).";

export default function NewLeadTrigger({
  workflow,
  onChanged,
  readOnly,
}: Props) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trigger = (workflow.trigger_config?.type === "trigger.new_lead"
    ? workflow.trigger_config
    : null) as NewLeadTriggerConfig | null;
  const filter = trigger?.config?.recipient_filter;
  const allowReEnroll = trigger?.config?.allow_re_enrollment ?? false;

  const save = async (next: NewLeadTriggerConfig) => {
    setSaving(true);
    setError(null);
    try {
      await workflowService.update(workflow.id, { trigger_config: next });
      onChanged();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to save trigger");
    } finally {
      setSaving(false);
    }
  };

  const handleFilterChange = async (newFilter: any) =>
    save({
      type: "trigger.new_lead",
      config: {
        recipient_filter: newFilter,
        allow_re_enrollment: allowReEnroll,
      },
    });

  const handleAllowReEnrollChange = async (v: boolean) =>
    save({
      type: "trigger.new_lead",
      config: {
        recipient_filter: filter || { sources: [] },
        allow_re_enrollment: v,
      },
    });

  const sourceCount = filter?.sources?.length || 0;

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-md p-3">
          <Zap className="h-5 w-5 text-emerald-700 mt-0.5" />
          <div className="text-sm">
            <div className="font-medium text-emerald-900">
              Auto-enrolls when a new lead arrives
            </div>
            <div className="text-emerald-800">
              When a lead is created from any of the watched sources and
              matches the filter, the workflow runs for them automatically.
              No <code>Run</code> button needed.
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between bg-muted/40 rounded-md p-4">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-medium">
                Forms / events / resources / Meta ad forms to watch
              </span>
              <InfoHint>
                Pick which submissions should fire this workflow. Whenever
                someone fills one of these forms / registers for one of these
                events / arrives from a watched Meta form, they're
                auto-enrolled.
              </InfoHint>
            </div>
            <div className="text-sm text-muted-foreground">
              {describeFilter(filter) || "Nothing selected yet — workflow won't fire"}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {SUPPORTED_NOTE}
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => setSelectorOpen(true)}
            disabled={saving}
          >
            {readOnly ? (
              <>
                <Eye className="h-4 w-4 mr-2" />
                View
              </>
            ) : (
              <>
                <Pencil className="h-4 w-4 mr-2" />
                {sourceCount === 0 ? "Pick forms" : "Edit"}
              </>
            )}
          </Button>
        </div>

        <div className="flex items-start gap-3">
          <Switch
            id="allow_re_enroll"
            checked={allowReEnroll}
            disabled={readOnly || saving}
            onCheckedChange={handleAllowReEnrollChange}
          />
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="allow_re_enroll" className="cursor-pointer">
                Allow re-enrollment after completion
              </Label>
              <InfoHint>
                Off (default): a lead is enrolled in this workflow at most
                once over their lifetime. On: after a lead's previous run
                finishes (completed / failed / cancelled), they can be
                enrolled again the next time they match.
              </InfoHint>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              A lead currently in this workflow is never re-enrolled while
              their run is still in progress — that's locked regardless of
              this setting. This toggle only controls what happens AFTER
              their previous run has ended.
            </p>
          </div>
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        <WebsiteFormPicker
          open={selectorOpen}
          onOpenChange={setSelectorOpen}
          value={filter}
          onChange={handleFilterChange}
          readOnly={readOnly}
        />
      </CardContent>
    </Card>
  );
}

function describeFilter(filter: any): string | null {
  if (!filter?.sources?.length) return null;
  const parts: string[] = [];
  for (const s of filter.sources) {
    if (s.type === "platform_leads") {
      const typesCount = (s.filters?.programs || []).reduce(
        (acc: number, p: any) => acc + (p.types?.length || 0),
        0
      );
      if (typesCount > 0) {
        parts.push(`${typesCount} form${typesCount > 1 ? "s" : ""}`);
      }
    } else if (s.type === "events") {
      const ef = s.filters?.eventFilters;
      if (!ef || Object.keys(ef).length === 0) {
        parts.push("any event");
      } else {
        const n = Object.keys(ef).length;
        parts.push(`${n} event${n > 1 ? "s" : ""}`);
      }
    } else if (s.type === "resources") {
      const rf = s.filters?.resourceFilters;
      if (!rf || Object.keys(rf).length === 0) {
        parts.push("any resource");
      } else {
        const n = Object.keys(rf).length;
        parts.push(`${n} resource${n > 1 ? "s" : ""}`);
      }
    } else if (s.type === "external_leads") {
      const metaSrcs = s.filters?.sources || [];
      let formCount = 0;
      for (const ms of metaSrcs) formCount += ms.form_ids?.length || 0;
      if (formCount > 0) {
        parts.push(`${formCount} Meta form${formCount > 1 ? "s" : ""}`);
      } else {
        parts.push("any Meta lead");
      }
    } else if (s.type === "users") {
      parts.push("user signups");
    }
  }
  return parts.length ? `Watching ${parts.join(", ")}` : null;
}
