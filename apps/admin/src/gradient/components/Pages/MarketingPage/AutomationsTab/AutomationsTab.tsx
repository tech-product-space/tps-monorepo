"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, Settings, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Textarea } from "@/gradient/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import Pagination from "@/gradient/components/ui/custom/Pagination";

import { workflowService } from "@/gradient/services/workflowService";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import type { IPaginationMeta } from "@/gradient/types/pagination";
import type { Workflow, WorkflowStatus } from "@/gradient/types/workflow";

import AutomationTable from "./AutomationTable";
import HealthBanner from "./HealthBanner";

const STATUS_FILTERS: { label: string; value: WorkflowStatus | null }[] = [
  { label: "All", value: null },
  { label: "Draft", value: "draft" },
  { label: "Live", value: "active" },
  { label: "Paused", value: "paused" },
  { label: "Archived", value: "archived" },
];

/**
 * The automations list. Rendered by `/marketing/automations`.
 *
 * Lives under Marketing rather than as its own nav group: it targets the same
 * audiences with the same editor, and it is the same person's job. A third
 * top-level item would suggest otherwise.
 */
export default function AutomationsTab() {
  const router = useRouter();

  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [status, setStatus] = useState<WorkflowStatus | null>(null);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(10);
  const [loading, setLoading] = useState(true);
  const [meta, setMeta] = useState<IPaginationMeta>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await workflowService.list({ status, page, limit });
      setWorkflows(res.data || []);
      if (res.meta) setMeta(res.meta);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to load automations"));
    } finally {
      setLoading(false);
    }
  }, [status, page, limit]);

  useEffect(() => {
    fetchWorkflows();
  }, [fetchWorkflows]);

  const handleCreate = async () => {
    if (!name.trim()) return;

    setCreating(true);
    try {
      const workflow = await workflowService.create(
        name.trim(),
        description.trim() || undefined,
      );
      // Straight into the editor. A workflow with only a name is not something
      // anyone wants to look at in a list.
      router.push(`/marketing/automations/${workflow.id}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to create the automation"));
      setCreating(false);
    }
  };

  const handleDuplicate = async (workflow: Workflow) => {
    try {
      const copy = await workflowService.duplicate(workflow.id);
      toast.success(`Copied to "${copy.name}"`);
      // Into the copy: duplicating is the first step of editing something,
      // never the last step of anything.
      router.push(`/marketing/automations/${copy.id}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to duplicate"));
    }
  };

  const handleArchive = async (workflow: Workflow) => {
    try {
      const result = await workflowService.archive(workflow.id);
      toast.success(
        result.cancelledEnrollments
          ? `Archived. ${result.cancelledEnrollments} journey${result.cancelledEnrollments === 1 ? "" : "s"} ended.`
          : `"${workflow.name}" archived`,
      );
      fetchWorkflows();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to archive"));
    }
  };

  const handlePause = async (workflow: Workflow) => {
    try {
      await workflowService.pause(workflow.id);
      toast.success("Paused. Nobody new will be enrolled.");
      fetchWorkflows();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to pause"));
    }
  };

  const handleResume = async (workflow: Workflow) => {
    try {
      const result = await workflowService.resume(workflow.id);
      toast.success(
        result.requeued
          ? `Resumed. ${result.requeued} journey${result.requeued === 1 ? "" : "s"} picked back up.`
          : "Resumed",
      );
      fetchWorkflows();
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to resume"));
    }
  };

  return (
    <div className="space-y-4">
      <HealthBanner />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_FILTERS.map((filter) => (
            <Button
              key={filter.label}
              variant={status === filter.value ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setStatus(filter.value);
                setPage(1);
              }}
            >
              {filter.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/marketing/automations/enrollments">
              <Users className="h-4 w-4 mr-1.5" />
              Enrolments
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/marketing/automations/settings">
              <Settings className="h-4 w-4 mr-1.5" />
              Settings
            </Link>
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            New automation
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : workflows.length === 0 ? (
        <div className="rounded-md border border-dashed py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {status
              ? "No automations with that status"
              : "No automations yet."}
          </p>
          {!status && (
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              An automation sends a sequence of emails over time — a welcome
              note now, a follow-up in three days — to everyone who matches its
              trigger.
            </p>
          )}
        </div>
      ) : (
        <>
          <AutomationTable
            workflows={workflows}
            onOpen={(w) => router.push(`/marketing/automations/${w.id}`)}
            onDuplicate={handleDuplicate}
            onArchive={handleArchive}
            onPause={handlePause}
            onResume={handleResume}
          />

          <Pagination
            meta={meta}
            onPageChange={setPage}
            onLimitChange={(next) => {
              setLimit(next);
              setPage(1);
            }}
          />
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New automation</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="PM Fellowship nurture"
                className="mt-1.5"
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1">
                Internal only — recipients never see it.
              </p>
            </div>

            <div>
              <label className="text-sm font-medium">
                Description <span className="text-muted-foreground">(optional)</span>
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this sends, and to whom"
                rows={2}
                className="mt-1.5"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={!name.trim() || creating}>
              {creating && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
