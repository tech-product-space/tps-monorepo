"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import LeadSelector from "@/components/Pages/Common/marketing/LeadSelector/LeadSelector";
import { Eye, Pencil, Users } from "lucide-react";
import InfoHint from "../../InfoHint";
import type {
  StaticListTriggerConfig,
  Workflow,
} from "@/types/workflow";
import { workflowService } from "@/services/workflow/workflowService";

type Props = {
  workflow: Workflow;
  onChanged: () => void;
  readOnly: boolean;
};

export default function StaticListTrigger({
  workflow,
  onChanged,
  readOnly,
}: Props) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trigger = (workflow.trigger_config?.type === "trigger.static_list"
    ? workflow.trigger_config
    : null) as StaticListTriggerConfig | null;
  const filter = trigger?.config?.recipient_filter;
  const batchSize = trigger?.config?.batch_size ?? 100;

  const save = async (next: StaticListTriggerConfig) => {
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

  const handleFilterChange = async (newFilter: any) => {
    await save({
      type: "trigger.static_list",
      config: {
        recipient_filter: newFilter,
        batch_size: trigger?.config?.batch_size ?? 100,
        scheduled_at: trigger?.config?.scheduled_at ?? null,
      },
    });
    setSelectorOpen(false);
  };

  const handleBatchSizeChange = async (v: string) => {
    const n = parseInt(v, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    await save({
      type: "trigger.static_list",
      config: {
        recipient_filter: filter || { sources: [] },
        batch_size: n,
        scheduled_at: trigger?.config?.scheduled_at ?? null,
      },
    });
  };

  const sourceCount = filter?.sources?.length || 0;

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          <strong>Static list:</strong> enrolls the leads matching this filter
          when you click <code>Run</code>. A one-time bulk send (no auto-enroll).
        </p>

        <div className="flex items-center justify-between bg-muted/40 rounded-md p-4">
          <div className="flex items-center gap-3">
            <Users className="h-5 w-5 text-muted-foreground" />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-medium">Recipient filter</span>
                <InfoHint>
                  Pick the exact leads who will be enrolled when you click
                  Run. You can mix sources (platform leads, external leads,
                  event/resource attendees, etc.).
                </InfoHint>
              </div>
              <div className="text-sm text-muted-foreground">
                {sourceCount === 0
                  ? "No sources selected yet"
                  : `${sourceCount} source${sourceCount > 1 ? "s" : ""} selected`}
              </div>
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
                {sourceCount === 0 ? "Select recipients" : "Edit"}
              </>
            )}
          </Button>
        </div>

        <div>
          <div className="flex items-center gap-1.5">
            <Label htmlFor="batch_size">Batch size (per minute)</Label>
            <InfoHint>
              How many leads we hand off to the engine each minute. Keep it
              modest (≤100) so SES doesn't throttle outbound email — the
              workflow will still cover the entire list, just over more
              minutes.
            </InfoHint>
          </div>
          <Input
            id="batch_size"
            type="number"
            defaultValue={batchSize}
            min={1}
            disabled={readOnly || saving}
            className="mt-2 max-w-[200px]"
            onBlur={(e) => handleBatchSizeChange(e.target.value)}
          />
          <p className="text-xs text-muted-foreground mt-1">
            Maximum number of leads enrolled per minute. Helps avoid SES
            throttling.
          </p>
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        <LeadSelector
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
