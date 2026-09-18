"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Settings as SettingsIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  workflowGlobalSettingsService,
  type WorkflowGlobalSettings,
} from "@/services/workflow/workflowGlobalSettingsService";
import { useAutomationBasePath } from "@/hooks/useAutomationBasePath";
import InfoHint from "./InfoHint";

const WorkflowGlobalSettingsPage = () => {
  const router = useRouter();
  const basePath = useAutomationBasePath();

  const [settings, setSettings] = useState<WorkflowGlobalSettings | null>(null);
  const [defaultCap, setDefaultCap] = useState<number | null>(null);
  const [maxActive, setMaxActive] = useState<string>("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await workflowGlobalSettingsService.get();
        if (cancelled) return;
        setSettings(data.settings);
        setDefaultCap(data.defaults?.max_active_workflows_per_lead ?? null);
        setMaxActive(String(data.settings.max_active_workflows_per_lead));
      } catch (e) {
        if (!cancelled) setError("Failed to load workflow settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);

      const n = parseInt(maxActive, 10);
      if (!Number.isFinite(n) || n < 1) {
        setError(
          "Max active workflows per lead must be a positive integer (1 or more)."
        );
        setSaving(false);
        return;
      }

      const next = await workflowGlobalSettingsService.update({
        max_active_workflows_per_lead: n,
      });
      setSettings(next);
      setSavedAt(Date.now());
    } catch (e: any) {
      setError(e?.response?.data?.message || "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const effective = settings?.max_active_workflows_per_lead ?? defaultCap;

  return (
    <div className="space-y-6 h-full overflow-y-auto pb-12">
      <div className="px-8 py-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`${basePath}/automation/workflows`)}
            title="Back to workflows"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <SettingsIcon className="h-6 w-6" />
              Workflow settings
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              System-wide controls that apply to every workflow.
            </p>
          </div>
        </div>
      </div>

      <div className="px-8 max-w-2xl">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Card>
            <CardContent className="p-6 space-y-6">
              <div>
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="cap">Max active workflows per lead</Label>
                  <InfoHint>
                    How many workflows a single lead can be in at the same
                    time. Default <strong>1</strong> — a lead who is already
                    in a workflow will be skipped (not enrolled) when another
                    workflow tries to pick them up, until the first workflow
                    completes, fails, or is cancelled. Raise this if you want
                    leads to flow through multiple workflows simultaneously.
                  </InfoHint>
                </div>
                <Input
                  id="cap"
                  type="number"
                  min={1}
                  value={maxActive}
                  onChange={(e) => setMaxActive(e.target.value)}
                  disabled={saving}
                  className="mt-2 max-w-[200px]"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  {effective != null && (
                    <>
                      Currently a lead can be active in up to{" "}
                      <span className="font-medium text-foreground">
                        {effective}
                      </span>{" "}
                      workflow{effective === 1 ? "" : "s"} at once.{" "}
                    </>
                  )}
                  Counted across all workflows, including paused ones.
                </p>
              </div>

              {error && (
                <div className="text-sm text-destructive">{error}</div>
              )}

              <div className="flex items-center gap-3">
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save
                </Button>
                {savedAt && !saving && (
                  <span className="text-xs text-muted-foreground">Saved</span>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default WorkflowGlobalSettingsPage;
