"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Pencil,
  Trash2,
  RefreshCw,
  Plus,
  Zap,
  ListChecks,
  Workflow as WorkflowIcon,
  Sparkles,
  Settings as SettingsIcon,
  Copy,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { workflowService } from "@/services/workflow/workflowService";
import type { Workflow, WorkflowStatus } from "@/types/workflow";
import { formatDataTime } from "@/utils/formatDataTime";
import { useAutomationBasePath } from "@/hooks/useAutomationBasePath";
import { WorkflowStatusBadge } from "./WorkflowStatusBadge";

const STATUS_TABS: Array<{ label: string; value: WorkflowStatus | "all" }> = [
  { label: "All", value: "all" },
  { label: "Drafts", value: "draft" },
  { label: "Active", value: "active" },
  { label: "Paused", value: "paused" },
  { label: "Archived", value: "archived" },
];

const REFRESH_MS = 15_000;

const WorkflowListPage = () => {
  const basePath = useAutomationBasePath();
  const router = useRouter();

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<WorkflowStatus | "all">("all");
  const [query, setQuery] = useState("");

  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const fetchWorkflows = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      try {
        if (mode === "initial") setLoading(true);
        else setRefreshing(true);
        setError(null);
        const data = await workflowService.list({
          status: statusFilter === "all" ? undefined : statusFilter,
          q: query.trim() || undefined,
        });
        setWorkflows(data.items);
      } catch (err) {
        console.error(err);
        setError("Failed to load workflows");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [statusFilter, query]
  );

  // A single effect handles both filter changes and search-query debounce so
  // the page only issues one request per state change (previously the two
  // effects fired in parallel on mount and on filter switches).
  const firstRun = useRef(true);
  useEffect(() => {
    const delay = firstRun.current ? 0 : 300;
    const t = setTimeout(() => {
      fetchWorkflows(firstRun.current ? "initial" : "refresh");
      firstRun.current = false;
    }, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, query]);

  // Periodic refresh + focus refresh so the list reflects updates made
  // elsewhere without forcing a page reload.
  useEffect(() => {
    const id = setInterval(() => {
      if (!document.hidden) fetchWorkflows("refresh");
    }, REFRESH_MS);
    const onFocus = () => fetchWorkflows("refresh");
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchWorkflows]);

  const handleCreate = async () => {
    if (!name.trim()) {
      setCreateError("Name is required");
      return;
    }
    try {
      setCreating(true);
      setCreateError(null);
      const wf = await workflowService.create({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setOpen(false);
      setName("");
      setDescription("");
      router.push(`${basePath}/automation/workflows/${wf.id}`);
    } catch (err) {
      console.error(err);
      setCreateError("Failed to create workflow");
    } finally {
      setCreating(false);
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await workflowService.archive(id);
      toast.success("Workflow archived");
      setWorkflows((prev) => prev.filter((w) => w.id !== id));
    } catch (err: any) {
      const data = err?.response?.data;
      // Backend returns active_count when archiving is blocked by in-flight
      // enrollments. Surface it so the admin sees the real number even if
      // the list cache was stale.
      const msg =
        typeof data?.active_count === "number"
          ? `Cannot archive — ${data.active_count} active enrollment${data.active_count > 1 ? "s" : ""} still running`
          : data?.message || "Failed to archive workflow";
      toast.error(msg);
      // Refresh so the displayed active_enrollments count catches up.
      fetchWorkflows("refresh");
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      setDuplicatingId(id);
      const copy = await workflowService.duplicate(id);
      toast.success("Workflow duplicated");
      router.push(`${basePath}/automation/workflows/${copy.id}`);
    } catch (err: any) {
      toast.error(
        err?.response?.data?.message || "Failed to duplicate workflow"
      );
    } finally {
      setDuplicatingId(null);
    }
  };

  const isEmpty = !loading && !error && workflows.length === 0;
  const isFirstUse =
    isEmpty && statusFilter === "all" && query.trim() === "";

  return (
    <div className="space-y-6 h-full overflow-y-auto pb-12">
      {/* Header */}
      <div className="flex px-8 py-5 items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <WorkflowIcon className="h-6 w-6" />
            Workflows
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Multi-step automations that run on lead activity.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => fetchWorkflows("refresh")}
            disabled={refreshing}
            title="Refresh"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              router.push(`${basePath}/automation/workflows/settings`)
            }
            title="Workflow settings"
          >
            <SettingsIcon className="h-4 w-4 mr-2" />
            Settings
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create workflow
              </Button>
            </DialogTrigger>
            <DialogContent className="w-full max-w-xl">
              <DialogHeader>
                <DialogTitle>Create a workflow</DialogTitle>
                <DialogDescription>
                  Just name it for now. You'll set up the steps and trigger
                  on the next screen.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Input
                  placeholder="e.g. Welcome new GenAI signups"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
                <Textarea
                  placeholder="Optional description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
                {createError && (
                  <div className="text-sm text-destructive">{createError}</div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={handleCreate} disabled={creating}>
                  {creating && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Status tabs + search */}
      <div className="px-8 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <Tabs
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as any)}
        >
          <TabsList>
            {STATUS_TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <Input
          placeholder="Search by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {/* Body */}
      <Card className="mx-8">
        <CardContent className="p-0">
          {loading && (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-16 text-destructive">
              {error}
              <div className="mt-4">
                <Button variant="outline" onClick={() => fetchWorkflows("initial")}>
                  Retry
                </Button>
              </div>
            </div>
          )}

          {/* First-use empty state */}
          {isFirstUse && (
            <div className="py-12 flex flex-col items-center text-center max-w-xl mx-auto px-6">
              <div className="rounded-full bg-primary/10 p-3 mb-4">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">
                Build your first automated workflow
              </h3>
              <p className="text-sm text-muted-foreground mb-6">
                Send a welcome email when someone signs up, follow up on event
                registrations, nurture leads over days.
              </p>
              <div className="text-xs text-left bg-muted/40 rounded-md p-4 mb-6 w-full">
                <div className="font-semibold mb-2">How it works</div>
                <ol className="space-y-1.5 pl-5 list-decimal">
                  <li>
                    <strong>Editor</strong> — drag steps (Send email, Wait)
                    into a flow ending at a Goal
                  </li>
                  <li>
                    <strong>Trigger</strong> — pick a one-time bulk run, or
                    real-time auto-enrollment from forms / events / signups
                  </li>
                  <li>
                    <strong>Publish</strong> — locks the flow, makes it active
                  </li>
                  <li>
                    <strong>Run / wait</strong> — for static lists, hit Run; for
                    real-time, it fires as leads arrive
                  </li>
                </ol>
              </div>
              <Button onClick={() => setOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create your first workflow
              </Button>
            </div>
          )}

          {/* Filtered-empty */}
          {!loading && !error && workflows.length === 0 && !isFirstUse && (
            <div className="py-16 text-center text-muted-foreground">
              No workflows match your filters.
            </div>
          )}

          {/* Table */}
          {!loading && !error && workflows.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                  <TableHead className="w-[140px]">Trigger</TableHead>
                  <TableHead className="w-[90px]">Active</TableHead>
                  <TableHead className="w-[160px]">Updated</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workflows.map((w) => (
                  <TableRow
                    key={w.id}
                    className="hover:bg-muted/40 cursor-pointer"
                    onClick={() =>
                      router.push(`${basePath}/automation/workflows/${w.id}`)
                    }
                  >
                    <TableCell>
                      <div className="font-medium">{w.name}</div>
                      {w.description && (
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {w.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <WorkflowStatusBadge status={w.status} />
                    </TableCell>
                    <TableCell>
                      <TriggerPill type={w.trigger_type ?? null} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {w.active_enrollments ?? 0}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDataTime(w.updatedAt)}
                    </TableCell>
                    <TableCell
                      className="flex gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() =>
                          router.push(`${basePath}/automation/workflows/${w.id}`)
                        }
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDuplicate(w.id)}
                        disabled={duplicatingId === w.id}
                        title="Duplicate"
                      >
                        {duplicatingId === w.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Archive"
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Archive workflow</AlertDialogTitle>
                            <AlertDialogDescription>
                              {(w.active_enrollments ?? 0) > 0 ? (
                                <>
                                  <strong className="text-foreground">
                                    {w.active_enrollments} active enrollment
                                    {(w.active_enrollments ?? 0) > 1 ? "s" : ""}
                                  </strong>{" "}
                                  must finish or be cancelled before this
                                  workflow can be archived. Open the workflow
                                  to cancel them.
                                </>
                              ) : (
                                "Archived workflows can't be re-published or run."
                              )}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleArchive(w.id)}
                              disabled={(w.active_enrollments ?? 0) > 0}
                              className="bg-destructive text-white hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Archive
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

function TriggerPill({ type }: { type: string | null }) {
  if (type === "trigger.new_lead") {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
        <Zap className="h-3 w-3" />
        Realtime
      </span>
    );
  }
  if (type === "trigger.static_list") {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-sky-50 border border-sky-200 text-sky-700">
        <ListChecks className="h-3 w-3" />
        Static list
      </span>
    );
  }
  return (
    <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
      None
    </span>
  );
}

export default WorkflowListPage;
