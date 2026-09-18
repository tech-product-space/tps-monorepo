"use client";

import { useState, useEffect } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Edit, Trash2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  deleteJob,
  setJobStatus,
  repostJob,
} from "@/services/job/jobService";

interface Job {
  id: string;
  title: string;
  location: string;
  employmentType: string;
  seniorityLevel: string;
  jobFunction: string;
  companyName: string;
  descriptionHtml: string;
  uploadedBy: string;
  status: string;
  jobSource: string;
  postedAt: string;
  repostedAt: string | null;
  repostCount: number;
}

const STATUS_COLOR: Record<string, string> = {
  published: "text-green-700",
  draft: "text-gray-600",
  closed: "text-red-700",
};

const formatDate = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (isNaN(date.getTime())) return "—";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
};

export default function JobsTable({
  mockJobs,
  onRefresh,
}: {
  mockJobs: Job[];
  onRefresh?: () => void;
}) {
  const router = useRouter();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [repostTarget, setRepostTarget] = useState<Job | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Job | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    setJobs(mockJobs);
  }, [mockJobs]);

  const handleEdit = (jobId: string) => {
    router.push(`jobs/edit/${jobId}`);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    const jobId = deleteTarget.id;
    setBusyId(jobId);
    try {
      await deleteJob(jobId);
      setJobs((prev) => prev.filter((job) => job.id !== jobId));
      setDeleteTarget(null);
    } catch (error) {
      console.error("Failed to delete job:", error);
    } finally {
      setBusyId(null);
    }
  };

  // Inline status change from the Status column (show / hide / close).
  const handleChangeStatus = async (job: Job, nextStatus: string) => {
    if (nextStatus === job.status) return;
    setBusyId(job.id);
    // Optimistic update so the dropdown reflects the choice instantly.
    setJobs((prev) =>
      prev.map((j) => (j.id === job.id ? { ...j, status: nextStatus } : j)),
    );
    try {
      await setJobStatus(job.id, nextStatus);
      onRefresh?.();
    } catch (error) {
      console.error("Failed to update job status:", error);
      // Revert on failure.
      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, status: job.status } : j)),
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleConfirmRepost = async () => {
    if (!repostTarget) return;
    const jobId = repostTarget.id;
    setBusyId(jobId);
    try {
      await repostJob(jobId);
      setRepostTarget(null);
      onRefresh?.();
    } catch (error) {
      console.error("Failed to repost job:", error);
    } finally {
      setBusyId(null);
    }
  };

  const truncate = (text: string) =>
    text && text.length > 30 ? text.slice(0, 30) + "..." : text;

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Company</TableHead>
            <TableHead>Source</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Posted</TableHead>
            <TableHead className="text-center">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => (
            <TableRow key={job.id}>
              <TableCell>{job.id}</TableCell>
              <TableCell>{truncate(job.title)}</TableCell>
              <TableCell>{job.companyName}</TableCell>
              <TableCell className="capitalize">
                {job.jobSource ?? "—"}
              </TableCell>
              <TableCell>
                <Select
                  value={job.status}
                  disabled={busyId === job.id}
                  onValueChange={(value) => handleChangeStatus(job, value)}
                >
                  <SelectTrigger
                    className={`w-32 capitalize font-medium ${STATUS_COLOR[job.status] ?? ""}`}
                  >
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="published">Published</SelectItem>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {formatDate(job.postedAt)}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => handleEdit(job.id)}
                  >
                    <Edit className="h-4 w-4" />
                    <span className="sr-only">Edit</span>
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    disabled={busyId === job.id}
                    onClick={() => setRepostTarget(job)}
                    title="Repost job"
                  >
                    <RefreshCw className="h-4 w-4" />
                    <span className="sr-only">Repost</span>
                  </Button>
                  {job.uploadedBy === "apify" && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="text-destructive"
                      disabled={busyId === job.id}
                      onClick={() => setDeleteTarget(job)}
                    >
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Delete</span>
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
          {jobs.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-center py-8 text-muted-foreground"
              >
                No jobs found. Create your first job posting!
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this job?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes
              {deleteTarget?.title ? ` "${deleteTarget.title}"` : " this job"}{" "}
              and cannot be undone. If you only want to hide it from the site,
              set its status to Draft or Closed instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={busyId === deleteTarget?.id}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Repost confirmation */}
      <AlertDialog
        open={!!repostTarget}
        onOpenChange={(open) => !open && setRepostTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Repost this job?</AlertDialogTitle>
            <AlertDialogDescription>
              This refreshes the posted date to today so the job moves back to
              the top of the public listings, and re-publishes it if it was
              hidden. Applications already received stay attached.
              <br />
              <br />
              Last posted: {formatDate(repostTarget?.postedAt)}
              {repostTarget?.repostCount
                ? ` · reposted ${repostTarget.repostCount} time(s) before`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRepost}
              disabled={busyId === repostTarget?.id}
            >
              Repost
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
