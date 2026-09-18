"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  FileText,
  Loader2,
  FileUp,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import { Badge } from "@/gradient/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { Switch } from "@/gradient/components/ui/switch";

import { projectService } from "@/gradient/services/projectService";
import { ProjectStep } from "@/gradient/types/project";
import StepImportDialog from "./StepImportDialog";

interface Props {
  projectId: string;
  onStepsChanged?: () => void;
}

/**
 * The guide — an ordered list of steps, each opening into a full-page editor.
 *
 * One level, not two. A free course is module → lesson; a guide is a flat list,
 * because the reference design has exactly one level of nesting and five to
 * eight steps is not a curriculum that needs chaptering.
 *
 * Reorder sends the **whole ordered id array**, not a pair of indices: the list
 * already knows its final order, so sending that is one round trip and is
 * idempotent on retry.
 */
export default function GuideEditor({ projectId, onStepsChanged }: Props) {
  const router = useRouter();

  const [steps, setSteps] = useState<ProjectStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingOrder, setSavingOrder] = useState(false);
  const [publishingAll, setPublishingAll] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const fetchSteps = useCallback(async () => {
    setLoading(true);
    try {
      const data = await projectService.getSteps(projectId);
      if (data.success) setSteps(data.data);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not load the guide");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchSteps();
  }, [fetchSteps]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;

    setCreating(true);
    try {
      const data = await projectService.createStep(projectId, {
        title: newTitle.trim(),
      });

      if (!data.success) {
        toast.error(data.message || "Could not add the step");
        return;
      }

      setDialogOpen(false);
      setNewTitle("");
      onStepsChanged?.();

      // Straight into the editor — an empty step is not a finished step, and
      // the admin's next action is always to write it.
      router.push(`/projects/${projectId}/steps/${data.data.id}`);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not add the step");
    } finally {
      setCreating(false);
    }
  };

  /**
   * Optimistic on the local array, then persisted.
   *
   * Moving a row and watching it snap back while a request completes is the
   * thing that makes a reorder control feel broken, so the list moves first and
   * refetches only if the save fails.
   */
  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;

    const next = [...steps];
    [next[index], next[target]] = [next[target], next[index]];
    setSteps(next);

    setSavingOrder(true);
    try {
      const data = await projectService.reorderSteps(
        projectId,
        next.map((s) => s.id),
      );
      if (!data.success) {
        toast.error(data.message || "Could not save the new order");
        fetchSteps();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not save the order");
      fetchSteps();
    } finally {
      setSavingOrder(false);
    }
  };

  const handleToggle = async (step: ProjectStep) => {
    try {
      const data = await projectService.toggleStepStatus(step.id);
      if (data.success) {
        setSteps((prev) =>
          prev.map((s) =>
            s.id === step.id ? { ...s, isPublished: data.isPublished } : s,
          ),
        );
        onStepsChanged?.();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not change the step");
    }
  };

  const handleDelete = async (step: ProjectStep) => {
    if (!window.confirm(`Delete the step "${step.title}"?`)) return;

    try {
      const data = await projectService.deleteStep(step.id);
      if (data.success) {
        toast.success("Step deleted");
        setSteps((prev) => prev.filter((s) => s.id !== step.id));
        onStepsChanged?.();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not delete the step");
    }
  };

  const handlePublishAll = async () => {
    setPublishingAll(true);
    try {
      const data = await projectService.publishAllSteps(projectId);
      if (data.success) {
        toast.success(data.message);
        fetchSteps();
        onStepsChanged?.();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not publish the steps");
    } finally {
      setPublishingAll(false);
    }
  };

  const draftCount = steps.filter((s) => !s.isPublished).length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Guide
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            The steps a reader works through. At least one must be published
            before the project can go live.
          </p>
        </div>

        <div className="flex gap-2">
          {draftCount > 0 && (
            <Button
              variant="outline"
              onClick={handlePublishAll}
              disabled={publishingAll}
            >
              {publishingAll ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Upload className="mr-2 h-4 w-4" />
              )}
              Publish all {draftCount} draft{draftCount === 1 ? "" : "s"}
            </Button>
          )}
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <FileUp className="mr-2 h-4 w-4" />
            Import steps
          </Button>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Add step
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : steps.length === 0 ? (
          <div className="rounded-lg border border-dashed py-10 text-center">
            <p className="font-medium">No steps yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Start with an overview — objective, context, and what they&apos;ll
              build. Already written it in a Google Doc? Import it.
            </p>
          </div>
        ) : (
          <ol className="space-y-2">
            {steps.map((step, index) => (
              <li
                key={step.id}
                className="flex items-center gap-3 rounded-lg border p-3"
              >
                <span className="w-6 text-center text-sm text-muted-foreground">
                  {index + 1}
                </span>

                <button
                  onClick={() =>
                    router.push(`/projects/${projectId}/steps/${step.id}`)
                  }
                  className="flex-1 text-left font-medium hover:underline"
                >
                  {step.title}
                </button>

                {!step.isPublished && (
                  <Badge variant="outline" className="text-muted-foreground">
                    Draft
                  </Badge>
                )}

                <Switch
                  checked={step.isPublished}
                  onCheckedChange={() => handleToggle(step)}
                  aria-label="Publish step"
                />

                <div className="flex gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === 0 || savingOrder}
                    onClick={() => move(index, -1)}
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={index === steps.length - 1 || savingOrder}
                    onClick={() => move(index, 1)}
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(step)}
                    aria-label="Delete step"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>

      <StepImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        projectId={projectId}
        existingSteps={steps}
        onImported={(created) => {
          // Appended rather than refetched: the API returns the rows it made,
          // in order, and they always land at the end of the guide.
          setSteps((prev) => [...prev, ...created]);
          onStepsChanged?.();
        }}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a guide step</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label>Step title</Label>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              placeholder="Setting up the main project"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              The URL is derived from this. You&apos;ll write the content next.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newTitle.trim()}>
              {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create &amp; write
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
