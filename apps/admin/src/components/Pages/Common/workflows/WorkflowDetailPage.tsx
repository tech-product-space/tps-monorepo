"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Play,
  Pause,
  PlayCircle,
  CheckCircle2,
  Archive,
  Zap,
  TestTube,
  Copy,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { WorkflowDetail } from "@/types/workflow";
import { workflowService } from "@/services/workflow/workflowService";
import { useAutomationBasePath } from "@/hooks/useAutomationBasePath";
import { WorkflowStatusBadge } from "./WorkflowStatusBadge";
import WorkflowEditorTab from "./tabs/WorkflowEditorTab";
import WorkflowTriggerTab from "./tabs/WorkflowTriggerTab";
import WorkflowSettingsTab from "./tabs/WorkflowSettingsTab";
import WorkflowEnrollmentsTab from "./tabs/WorkflowEnrollmentsTab";
import WorkflowReadinessStepper, {
  computeStages,
} from "./WorkflowReadinessStepper";

type Props = { workflowId: string };

export default function WorkflowDetailPage({ workflowId }: Props) {
  const basePath = useAutomationBasePath();
  const router = useRouter();
  const [detail, setDetail] = useState<WorkflowDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("editor");
  const [busy, setBusy] = useState<string | null>(null);
  const [publishErrors, setPublishErrors] = useState<string[] | null>(null);
  const [runResult, setRunResult] = useState<string | null>(null);
  const [enrollOneOpen, setEnrollOneOpen] = useState(false);
  const [enrollSourceType, setEnrollSourceType] = useState<string>("platform_leads");
  const [enrollSourceId, setEnrollSourceId] = useState<string>("");

  const fetchDetail = async () => {
    // Only show the full-page spinner on the very first load. Subsequent
    // refreshes (after a save, publish, pause, etc.) happen silently so the
    // editor canvas doesn't unmount and remount on every keystroke.
    const isInitialLoad = detail === null;
    try {
      if (isInitialLoad) setLoading(true);
      setError(null);
      const data = await workflowService.get(workflowId);
      setDetail(data);
    } catch (e) {
      console.error(e);
      if (isInitialLoad) setError("Failed to load workflow");
    } finally {
      if (isInitialLoad) setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetail();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  const handlePublish = async () => {
    if (!detail) return;
    try {
      setBusy("publish");
      setPublishErrors(null);
      const res = await workflowService.publish(detail.workflow.id);
      toast.success(`Published as v${res.version}`);
      fetchDetail();
    } catch (e: any) {
      const data = e?.response?.data;
      if (data?.details?.errors && Array.isArray(data.details.errors)) {
        setPublishErrors(data.details.errors);
      } else {
        toast.error(data?.message || "Failed to publish");
      }
    } finally {
      setBusy(null);
    }
  };

  const handleRun = async () => {
    if (!detail) return;
    try {
      setBusy("run");
      const res = await workflowService.run(detail.workflow.id);
      setRunResult(res.run_id);
      toast.success("Bulk enrollment queued");
      // give the worker a beat to insert enrollments, then refetch stats
      setTimeout(fetchDetail, 1500);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to run");
    } finally {
      setBusy(null);
    }
  };

  const handleEnrollOne = async () => {
    if (!detail) return;
    if (!enrollSourceId.trim()) {
      toast.error("lead_source_id is required");
      return;
    }
    try {
      setBusy("enroll-one");
      const res = await workflowService.enrollOne(detail.workflow.id, {
        lead_source_type: enrollSourceType,
        lead_source_id: enrollSourceId.trim(),
      });
      toast.success(`Enrolled (id ${res.enrollment_id.slice(0, 8)}…)`);
      setEnrollOneOpen(false);
      setEnrollSourceId("");
      setTimeout(fetchDetail, 800);
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to enroll");
    } finally {
      setBusy(null);
    }
  };

  const handlePause = async () => {
    if (!detail) return;
    try {
      setBusy("pause");
      await workflowService.pause(detail.workflow.id);
      toast.success("Workflow paused");
      fetchDetail();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to pause");
    } finally {
      setBusy(null);
    }
  };

  const handleResume = async () => {
    if (!detail) return;
    try {
      setBusy("resume");
      await workflowService.resume(detail.workflow.id);
      toast.success("Workflow resumed");
      fetchDetail();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || "Failed to resume");
    } finally {
      setBusy(null);
    }
  };

  const handleArchive = async () => {
    if (!detail) return;
    try {
      setBusy("archive");
      await workflowService.archive(detail.workflow.id);
      toast.success("Workflow archived");
      router.push(`${basePath}/automation/workflows`);
    } catch (e: any) {
      const data = e?.response?.data;
      // Stale stats: a new enrollment may have started since the page
      // loaded. Surface the actual server-side count and refresh.
      if (typeof data?.active_count === "number") {
        toast.error(
          `Cannot archive — ${data.active_count} active enrollment${data.active_count > 1 ? "s" : ""} still running`
        );
        fetchDetail();
      } else {
        toast.error(data?.message || "Failed to archive workflow");
      }
    } finally {
      setBusy(null);
    }
  };

  const handleDuplicate = async () => {
    if (!detail) return;
    try {
      setBusy("duplicate");
      const copy = await workflowService.duplicate(detail.workflow.id);
      toast.success("Workflow duplicated");
      router.push(`${basePath}/automation/workflows/${copy.id}`);
    } catch (e: any) {
      toast.error(
        e?.response?.data?.message || "Failed to duplicate workflow"
      );
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="text-center py-16 text-destructive">
        {error || "Workflow not found"}
      </div>
    );
  }

  const wf = detail.workflow;
  // Editor + Trigger tabs change the workflow's behaviour — they must come
  // back to draft before editing. Settings (name, description, frequency cap)
  // is a live-read guardrail and stays editable until the workflow is archived.
  const readOnly = wf.status !== "draft";
  const settingsReadOnly = wf.status === "archived";

  return (
    <div className="space-y-6 h-full overflow-y-auto pb-12">
      {/* Header */}
      <div className="px-8 py-4 border-b">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {/* LEFT: back + title + status */}
          <div className="flex items-center gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push(`${basePath}/automation/workflows`)}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-semibold truncate">{wf.name}</h1>
            <WorkflowStatusBadge status={wf.status} />
            {wf.current_version != null && (
              <span className="text-sm text-muted-foreground">
                v{wf.current_version}
              </span>
            )}
          </div>

          {/* RIGHT: action buttons (Publish / Run / Pause / Resume / Archive) */}
          <TooltipProvider delayDuration={200}>
            <div className="flex items-center gap-2 flex-wrap">
              {wf.status === "draft" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={handlePublish} disabled={!!busy} size="sm">
                      {busy === "publish" && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Publish
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Validate and lock this draft as a new version, then make it
                    active so it can enroll leads.
                  </TooltipContent>
                </Tooltip>
              )}

              {wf.status === "active" && (
                <>
                  {wf.trigger_config?.type === "trigger.new_lead" ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEnrollOneOpen(true)}
                          disabled={!!busy}
                        >
                          <TestTube className="h-4 w-4 mr-2" />
                          Enroll one (test)
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Manually enroll a single known lead to test the flow,
                        bypassing the realtime trigger.
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button onClick={handleRun} disabled={!!busy} size="sm">
                          {busy === "run" && (
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          )}
                          <Play className="h-4 w-4 mr-2" />
                          Run
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        Bulk-enroll every lead matching the recipient filter
                        right now (static-list one-time send).
                      </TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePause}
                        disabled={!!busy}
                      >
                        <Pause className="h-4 w-4 mr-2" />
                        Pause
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Stop new enrollments and freeze in-flight ones. You can
                      resume later — no work is lost.
                    </TooltipContent>
                  </Tooltip>
                </>
              )}

              {wf.status === "paused" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button onClick={handleResume} disabled={!!busy} size="sm">
                      <PlayCircle className="h-4 w-4 mr-2" />
                      Resume
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Resume the workflow. Frozen enrollments continue where they
                    left off and new ones can be created again.
                  </TooltipContent>
                </Tooltip>
              )}

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDuplicate}
                    disabled={!!busy}
                  >
                    {busy === "duplicate" ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Copy className="h-4 w-4 mr-2" />
                    )}
                    Duplicate
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Make a fresh draft copy with the same flow and trigger.
                  Settings reset; you can edit and publish independently.
                </TooltipContent>
              </Tooltip>

              {wf.status !== "archived" && (
                <AlertDialog>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertDialogTrigger asChild>
                        <Button variant="outline" size="sm" disabled={!!busy}>
                          <Archive className="h-4 w-4 mr-2" />
                          Archive
                        </Button>
                      </AlertDialogTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      Retire this workflow. Archived workflows can't be
                      re-published or run again.
                    </TooltipContent>
                  </Tooltip>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Archive workflow</AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-2 text-sm text-muted-foreground">
                          {detail.stats.enrollments_active > 0 ? (
                            <>
                              <p>
                                This workflow has{" "}
                                <strong className="text-foreground">
                                  {detail.stats.enrollments_active} active
                                  enrollment
                                  {detail.stats.enrollments_active > 1 ? "s" : ""}
                                </strong>
                                . Archiving is blocked until they complete or
                                are cancelled.
                              </p>
                              <AlertDialogCancel
                                asChild
                                className="m-0 p-0 h-auto border-0 hover:bg-transparent"
                              >
                                <button
                                  type="button"
                                  className="text-primary hover:underline text-sm"
                                  onClick={() => setActiveTab("enrollments")}
                                >
                                  View active enrollments →
                                </button>
                              </AlertDialogCancel>
                            </>
                          ) : (
                            <p>
                              Once archived, the workflow can't be re-published
                              or run.
                            </p>
                          )}
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleArchive}
                        disabled={detail.stats.enrollments_active > 0}
                        className="bg-destructive text-white hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Archive
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </TooltipProvider>
        </div>

        {/* Compact stats row — small, informational */}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          {wf.description && (
            <span className="truncate max-w-md">{wf.description}</span>
          )}
          {wf.description && (
            <span className="text-zinc-300" aria-hidden>·</span>
          )}
          <StatChip
            label="Active"
            value={detail.stats.enrollments_active}
            tone="sky"
          />
          <StatChip
            label="Completed"
            value={detail.stats.enrollments_completed}
            tone="emerald"
          />
          <StatChip
            label="Failed"
            value={detail.stats.enrollments_failed}
            tone="rose"
          />
          <StatChip
            label="Cancelled"
            value={detail.stats.enrollments_cancelled}
            tone="zinc"
          />
          {runResult && (
            <>
              <span className="text-zinc-300" aria-hidden>·</span>
              <span>Last run: <code className="text-[10px]">{runResult.slice(0, 12)}</code></span>
            </>
          )}
        </div>
      </div>

      {/* Readiness stepper (hides itself once everything's done) */}
      <div className="px-8">
        <WorkflowReadinessStepper
          workflow={wf}
          activeEnrollments={detail.stats.enrollments_active}
          completedEnrollments={detail.stats.enrollments_completed}
        />
      </div>

      {/* Tabs */}
      <div className="px-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="editor">
              Editor
              {(() => {
                const buildStage = computeStages(
                  wf,
                  detail.stats.enrollments_active,
                  detail.stats.enrollments_completed
                ).find((s) => s.id === "build");
                return buildStage?.state === "current" ? (
                  <span className="ml-2 h-1.5 w-1.5 rounded-full bg-amber-500" />
                ) : null;
              })()}
            </TabsTrigger>
            <TabsTrigger value="trigger">
              Trigger
              {(() => {
                const tStage = computeStages(
                  wf,
                  detail.stats.enrollments_active,
                  detail.stats.enrollments_completed
                ).find((s) => s.id === "trigger");
                return tStage?.state !== "done" ? (
                  <span className="ml-2 h-1.5 w-1.5 rounded-full bg-amber-500" />
                ) : null;
              })()}
            </TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="enrollments">
              Enrollments
              {detail.stats.enrollments_active > 0 && (
                <span className="ml-2 text-xs px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700">
                  {detail.stats.enrollments_active}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="editor" className="mt-4">
            <WorkflowEditorTab
              workflow={wf}
              onChanged={fetchDetail}
              readOnly={readOnly}
              onSwitchToTrigger={() => setActiveTab("trigger")}
            />
          </TabsContent>

          <TabsContent value="trigger" className="mt-4">
            <WorkflowTriggerTab
              workflow={wf}
              onChanged={fetchDetail}
              readOnly={readOnly}
            />
          </TabsContent>

          <TabsContent value="settings" className="mt-4">
            <WorkflowSettingsTab
              workflow={wf}
              onChanged={fetchDetail}
              readOnly={settingsReadOnly}
            />
          </TabsContent>

          <TabsContent value="enrollments" className="mt-4">
            <WorkflowEnrollmentsTab workflow={wf} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Publish errors dialog */}
      <Dialog
        open={!!publishErrors}
        onOpenChange={(o) => !o && setPublishErrors(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cannot publish — fix these first</DialogTitle>
          </DialogHeader>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {publishErrors?.map((e, i) => (
              <li key={i} className="text-destructive">
                {e}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button onClick={() => setPublishErrors(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Enroll-one (manual test) dialog */}
      <Dialog open={enrollOneOpen} onOpenChange={setEnrollOneOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enroll one lead (test)</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Manually enrolls one specific lead, bypassing the auto-trigger.
            Useful for verifying the workflow on a known lead before relying on
            real signups.
          </p>
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="enroll-source-type">Source</Label>
              <Select
                value={enrollSourceType}
                onValueChange={setEnrollSourceType}
              >
                <SelectTrigger id="enroll-source-type" className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="platform_leads">platform_leads</SelectItem>
                  <SelectItem value="external_leads">external_leads</SelectItem>
                  <SelectItem value="events">events</SelectItem>
                  <SelectItem value="resources">resources</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="enroll-source-id">Lead ID</Label>
              <Input
                id="enroll-source-id"
                value={enrollSourceId}
                onChange={(e) => setEnrollSourceId(e.target.value)}
                placeholder="e.g. 357"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Primary key of the row in the chosen source table.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEnrollOneOpen(false)}
              disabled={busy === "enroll-one"}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEnrollOne}
              disabled={busy === "enroll-one"}
            >
              {busy === "enroll-one" && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Enroll
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const TONE_CLASS: Record<string, string> = {
  sky: "text-sky-700",
  emerald: "text-emerald-700",
  rose: "text-rose-700",
  zinc: "text-zinc-600",
};

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "sky" | "emerald" | "rose" | "zinc";
}) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className={`font-semibold ${TONE_CLASS[tone]}`}>{value}</span>
      <span className="text-muted-foreground">{label.toLowerCase()}</span>
    </span>
  );
}
