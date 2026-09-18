"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ExternalLink, Inbox, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/gradient/components/ui/badge";
import { Button } from "@/gradient/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { Label } from "@/gradient/components/ui/label";
import { Textarea } from "@/gradient/components/ui/textarea";

import { projectService } from "@/gradient/services/projectService";
import { Project, ProjectStatus } from "@/gradient/types/project";
import { LevelBadge } from "./ProjectBadges";

const QUEUES: { key: ProjectStatus; label: string }[] = [
  { key: "submitted", label: "Awaiting review" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

/**
 * The review queue.
 *
 * Not its own endpoint — it is the ordinary project list filtered to
 * `source=community`, so sorting, pagination and filtering are implemented once.
 *
 * **Approving does not publish.** It routes into the edit form instead, because
 * a submission almost always needs a copy edit, a category and a skills list
 * before it is fit for the grid — approval is the start of the editing job, not
 * the end of it, and the navigation should say so.
 */
export default function ProjectSubmissionsPage() {
  const router = useRouter();

  const [queue, setQueue] = useState<ProjectStatus>("submitted");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const [rejecting, setRejecting] = useState<Project | null>(null);
  const [reason, setReason] = useState("");

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const data = await projectService.getAllProjects({
        source: "community",
        status: queue,
        limit: 50,
      });
      if (data.success) setProjects(data.data);
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Could not load submissions",
      );
    } finally {
      setLoading(false);
    }
  }, [queue]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const handleApprove = async (project: Project) => {
    setActing(project.id);
    try {
      const data = await projectService.reviewProject(project.id, {
        decision: "approved",
      });

      if (data.success) {
        toast.success("Approved — now tidy it up before publishing");
        router.push(`/projects/${project.id}?tab=Details`);
      } else {
        toast.error(data.message || "Could not approve");
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not approve");
    } finally {
      setActing(null);
    }
  };

  const handleReject = async () => {
    if (!rejecting) return;

    setActing(rejecting.id);
    try {
      const data = await projectService.reviewProject(rejecting.id, {
        decision: "rejected",
        rejectionReason: reason.trim() || undefined,
      });

      if (data.success) {
        toast.success("Submission rejected");
        setRejecting(null);
        setReason("");
        fetchSubmissions();
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not reject");
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b">
        {QUEUES.map((q) => (
          <button
            key={q.key}
            onClick={() => setQueue(q.key)}
            className={
              queue === q.key
                ? "border-b-2 border-primary px-4 py-2 text-sm font-medium"
                : "px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
            }
          >
            {q.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <Inbox className="h-8 w-8 text-muted-foreground" />
          <p className="font-medium">Nothing here</p>
          <p className="text-sm text-muted-foreground">
            {queue === "submitted"
              ? "No submissions waiting for review."
              : `No ${queue} submissions.`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((project) => (
            <Card key={project.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="space-y-2">
                    <CardTitle>{project.title}</CardTitle>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">
                        {project.category?.name ?? "Uncategorised"}
                      </Badge>
                      <LevelBadge level={project.level} />
                    </div>
                  </div>

                  {queue === "submitted" && (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setRejecting(project)}
                        disabled={acting === project.id}
                      >
                        <X className="mr-2 h-4 w-4" />
                        Reject
                      </Button>
                      <Button
                        onClick={() => handleApprove(project)}
                        disabled={acting === project.id}
                      >
                        {acting === project.id ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Check className="mr-2 h-4 w-4" />
                        )}
                        Approve &amp; edit
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                <p className="text-sm">{project.summary}</p>

                {project.skills?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {project.skills.map((skill) => (
                      <Badge key={skill} variant="outline">
                        {skill}
                      </Badge>
                    ))}
                  </div>
                )}

                {project.downloadUrl && (
                  <a
                    href={project.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {project.downloadUrl}
                  </a>
                )}

                <div className="rounded-lg border bg-muted/40 p-3 text-sm">
                  <p className="font-medium">Submitted by</p>
                  <p className="text-muted-foreground">
                    {project.submitter?.name} · {project.submitter?.email}
                    {project.submitter?.phone && ` · ${project.submitter.phone}`}
                  </p>
                  {/* Labelled rather than printed raw: two bare URLs stacked
                      read as one wrapped link, and the label is shorter than
                      the URL it stands in for. */}
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {project.submitter?.githubUrl && (
                      <a
                        href={project.submitter.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        GitHub
                      </a>
                    )}
                    {project.submitter?.linkedinUrl && (
                      <a
                        href={project.submitter.linkedinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        LinkedIn
                      </a>
                    )}
                  </div>
                  {project.submitter?.note && (
                    <p className="mt-2 italic text-muted-foreground">
                      “{project.submitter.note}”
                    </p>
                  )}

                  {/* The most useful link in the queue for whoever writes the
                      guide, so it gets its own line rather than a chip. */}
                  {project.submittedGuideUrl && (
                    <p className="mt-2">
                      <span className="text-muted-foreground">
                        Their write-up:{" "}
                      </span>
                      <a
                        href={project.submittedGuideUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {project.submittedGuideUrl}
                      </a>
                    </p>
                  )}
                </div>

                {project.rejectionReason && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm">
                    <p className="font-medium text-rose-900">Rejected because</p>
                    <p className="text-rose-800">{project.rejectionReason}</p>
                  </div>
                )}

                {queue === "approved" && (
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/projects/${project.id}`)}
                  >
                    Open project
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={Boolean(rejecting)}
        onOpenChange={(open) => !open && setRejecting(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this submission?</DialogTitle>
          </DialogHeader>

          <div className="space-y-2">
            <Label>Why? (kept internally)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Duplicate of an existing project; link is dead; out of scope…"
            />
            <p className="text-xs text-muted-foreground">
              The submitter is not emailed — we don&apos;t send rejection mail
              yet. The row is kept as the record of what was reviewed.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject}>
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
