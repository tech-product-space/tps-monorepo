"use client";

import { ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Edit,
  Eye,
  Loader2,
  RefreshCcw,
  SearchX,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import { Button } from "@/gradient/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import Pagination, { IPaginationMeta } from "@/gradient/components/ui/custom/Pagination";

import { recordingService } from "@/gradient/services/recordingService";
import { RecordingResponse } from "@/gradient/types/recording";
import { ToggleRecordingStatus } from "./ToggleRecordingStatus";

interface Props {
  recordings: RecordingResponse[];
  fetchRecordings: () => void;
  /** Delete needs its own hook: the page may have to step back a page. */
  onDeleted: () => void;
  fetchLoading: boolean;
  meta: IPaginationMeta;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  /** Changes the empty state from "none yet" to "none match" - a different fix. */
  hasFilters: boolean;
  filterBar: ReactNode;
}

/** "90" → "1 hr 30 mins". The badge on both public pages reads the same number. */
const formatDuration = (minutes?: number | null) => {
  if (!minutes) return "—";
  if (minutes < 60) return `${minutes} mins`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;

  return rest ? `${hours} hr ${rest} mins` : `${hours} hr`;
};

export default function RecordingTable({
  recordings,
  fetchRecordings,
  onDeleted,
  fetchLoading,
  meta,
  onPageChange,
  onLimitChange,
  hasFilters,
  filterBar,
}: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const router = useRouter();

  const handleDelete = (recording: RecordingResponse) => {
    toast(`Delete "${recording.title}"?`, {
      description: recording.leadCount
        ? `This also deletes ${recording.leadCount} captured lead${
            recording.leadCount === 1 ? "" : "s"
          }. This cannot be undone.`
        : "This action cannot be undone.",
      duration: 8000,
      action: { label: "Delete", onClick: () => confirmDelete(recording.id) },
      cancel: { label: "Cancel", onClick: () => {} },
    });
  };

  const confirmDelete = async (id: string) => {
    setDeletingId(id);
    const toastId = toast.loading("Deleting recording...");
    try {
      await recordingService.deleteRecording(id);
      toast.success("Recording deleted", { id: toastId });
      onDeleted();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to delete recording.",
        { id: toastId },
      );
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>All Recordings</CardTitle>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchRecordings}
          disabled={fetchLoading}
        >
          <RefreshCcw
            className={`w-4 h-4 ${fetchLoading ? "animate-spin" : ""}`}
          />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {filterBar}

        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Length</TableHead>
                {/* People, not plays. One row per (recording, person), so
                    somebody who opens this ten times across four devices is
                    one view. See `resolveLeadCounts` in the API. */}
                <TableHead className="text-right">Views</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fetchLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading recordings...
                    </div>
                  </TableCell>
                </TableRow>
              ) : recordings.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      {hasFilters ? (
                        <>
                          <SearchX className="h-6 w-6" />
                          No recording matches these filters. Clear them to see
                          everything.
                        </>
                      ) : (
                        <>
                          <Video className="h-6 w-6" />
                          No recordings yet. Use “Add New Recording” to
                          create one.
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                recordings.map((recording) => (
                  <TableRow key={recording.id}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{recording.title}</span>
                        <span className="text-xs text-muted-foreground">
                          /{recording.slug}
                        </span>
                        {/* The badge the card will show, on the row, so the
                            listing answers "what kind of session was this?"
                            without a click into the editor. */}
                        {recording.format && (
                          <span className="mt-0.5 w-fit rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {recording.format}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {recording.category?.name ?? (
                        <span className="text-muted-foreground">
                          Uncategorised
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {formatDuration(recording.durationMinutes)}
                    </TableCell>
                    <TableCell className="text-right">
                      {recording.leadCount ?? 0}
                    </TableCell>
                    <TableCell>
                      <ToggleRecordingStatus
                        recording={recording}
                        onChange={fetchRecordings}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Leads and email"
                          onClick={() =>
                            router.push(`/recordings/manage/${recording.id}`)
                          }
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Edit"
                          onClick={() =>
                            router.push(`/recordings/${recording.id}`)
                          }
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Delete"
                          disabled={deletingId === recording.id}
                          onClick={() => handleDelete(recording)}
                        >
                          {deletingId === recording.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4 text-destructive" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Hidden when there is nothing to page through - a lone "1 of 1"
              with four dead arrows is chrome, not a control. */}
          {meta.total > 0 && (meta.totalPages > 1 || meta.total > 10) && (
            <Pagination
              meta={meta}
              onPageChange={onPageChange}
              onLimitChange={onLimitChange}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
