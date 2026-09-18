"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Settings as SettingsIcon } from "lucide-react";
import type { Workflow } from "@/types/workflow";
import { workflowService } from "@/services/workflow/workflowService";
import { useAutomationBasePath } from "@/hooks/useAutomationBasePath";
import InfoHint from "../InfoHint";

type Props = {
  workflow: Workflow;
  onChanged: () => void;
  readOnly: boolean;
};

export default function WorkflowSettingsTab({
  workflow,
  onChanged,
  readOnly,
}: Props) {
  const basePath = useAutomationBasePath();
  const [name, setName] = useState(workflow.name);
  const [description, setDescription] = useState(workflow.description || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      await workflowService.update(workflow.id, {
        name: name.trim() || workflow.name,
        description: description.trim() || null,
      });
      onChanged();
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-6 space-y-4">
        <div>
          <div className="flex items-center gap-1.5">
            <Label htmlFor="wf-name">Name</Label>
            <InfoHint>
              Internal label admins see in the workflow list. Recipients never
              see this — it's purely for your team to identify the flow.
            </InfoHint>
          </div>
          <Input
            id="wf-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={readOnly || saving}
            className="mt-2"
          />
        </div>

        <div>
          <div className="flex items-center gap-1.5">
            <Label htmlFor="wf-description">Description</Label>
            <InfoHint>
              Optional notes about what this workflow does and who it
              targets. Shown only in the admin panel.
            </InfoHint>
          </div>
          <Textarea
            id="wf-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={readOnly || saving}
            rows={3}
            className="mt-2"
          />
        </div>

        <div className="rounded-md border bg-muted/30 px-4 py-3 flex items-start gap-3">
          <SettingsIcon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
          <div className="text-sm">
            <div className="font-medium">Concurrent workflow limit</div>
            <p className="text-muted-foreground mt-0.5">
              The number of workflows a single lead can be active in at once
              is configured system-wide. By default a lead can only be in one
              workflow at a time — raise it in settings to let leads run
              through multiple workflows simultaneously.{" "}
              <Link
                href={`${basePath}/automation/workflows/settings`}
                className="underline text-foreground"
              >
                Open workflow settings
              </Link>
              .
            </p>
          </div>
        </div>

        {error && <div className="text-sm text-destructive">{error}</div>}

        <div className="flex items-center gap-3">
          <Button onClick={handleSave} disabled={readOnly || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
          {savedAt && !saving && (
            <span className="text-xs text-muted-foreground">Saved</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
