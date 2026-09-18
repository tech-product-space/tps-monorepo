"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, Pencil, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

import { useNotification } from "@/helpers/NotificationContext";
import { useAutomationBasePath } from "@/hooks/useAutomationBasePath";
import {
  deleteRecording,
  toggleRecordingStatus,
} from "@/services/recordings/recordingsService";
import { formatDuration } from "@/utils/recording";
import { RecordingResponse } from "@/types/recording";

interface Props {
  recordings: RecordingResponse[];
  /** True when a filter is narrowing the list — "none match" is not "none yet". */
  filtered: boolean;
  onRefresh: () => void;
}

export default function RecordingTable({
  recordings,
  filtered,
  onRefresh,
}: Props) {
  const router = useRouter();
  const basePath = useAutomationBasePath();
  const { showNotification } = useNotification();

  const [pendingDelete, setPendingDelete] = useState<RecordingResponse | null>(
    null
  );
  const [togglingId, setTogglingId] = useState<string | null>(null);

  /**
   * The API refuses to publish a recording with no video, and the message it
   * sends back — "Add a YouTube link before publishing this recording." — is the
   * one thing the admin needs to read. Shown, not swallowed: a switch that
   * silently springs back looks like a bug in the panel.
   */
  const handleToggle = async (recording: RecordingResponse) => {
    setTogglingId(recording.id);
    try {
      const response = await toggleRecordingStatus(recording.id);
      showNotification(
        "success",
        response.isPublished ? "Recording published" : "Recording unpublished"
      );
      onRefresh();
    } catch (error: any) {
      showNotification(
        "error",
        error?.response?.data?.message || "Could not change the status"
      );
    } finally {
      setTogglingId(null);
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;

    try {
      await deleteRecording(pendingDelete.id);
      showNotification("success", "Recording deleted");
      setPendingDelete(null);
      onRefresh();
    } catch (error: any) {
      showNotification(
        "error",
        error?.response?.data?.message || "Could not delete the recording"
      );
    }
  };

  if (!recordings.length) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-10 text-center">
        <p className="text-sm text-gray-600">
          {filtered
            ? "No recordings match these filters."
            : "No recordings yet. Add your first one to get started."}
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="rounded-lg border border-gray-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recording</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Format</TableHead>
              <TableHead>Length</TableHead>
              <TableHead>Leads</TableHead>
              <TableHead>Views</TableHead>
              <TableHead>Published</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recordings.map((recording) => (
              <TableRow key={recording.id} className="hover:bg-gray-50">
                <TableCell>
                  <div className="flex items-center gap-3">
                    {recording.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={recording.thumbnail}
                        alt=""
                        className="h-10 w-16 shrink-0 rounded object-cover"
                      />
                    ) : (
                      <div className="h-10 w-16 shrink-0 rounded bg-gray-100" />
                    )}
                    <div className="min-w-0">
                      <div className="truncate font-medium text-gray-900">
                        {recording.title}
                      </div>
                      <div className="truncate text-xs text-gray-500">
                        /{recording.slug}
                      </div>
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  {recording.category ? (
                    <Badge
                      variant="outline"
                      className="border-blue-200 bg-blue-50 text-blue-700"
                    >
                      {recording.category.name}
                    </Badge>
                  ) : (
                    <span className="text-xs text-gray-400">Uncategorised</span>
                  )}
                </TableCell>

                <TableCell>
                  {recording.format ? (
                    <Badge variant="outline">{recording.format}</Badge>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </TableCell>

                <TableCell className="text-sm text-gray-600">
                  {formatDuration(recording.durationMinutes)}
                </TableCell>

                {/* People, then passes. Two numbers, two columns — a single
                    "views" column would quietly conflate them. */}
                <TableCell className="text-sm text-gray-900">
                  {recording.leadCount ?? 0}
                </TableCell>
                <TableCell className="text-sm text-gray-600">
                  {recording.viewCount ?? 0}
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={recording.isPublished}
                      disabled={togglingId === recording.id}
                      onCheckedChange={() => handleToggle(recording)}
                    />
                    <span className="text-xs text-gray-500">
                      {recording.isPublished ? "Live" : "Draft"}
                    </span>
                  </div>
                </TableCell>

                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Manage — overview and leads"
                      onClick={() =>
                        router.push(
                          `${basePath}/recordings/manage/${recording.id}`
                        )
                      }
                    >
                      <BarChart3 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Edit"
                      onClick={() =>
                        router.push(
                          `${basePath}/recordings/edit/${recording.id}`
                        )
                      }
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Delete"
                      onClick={() => setPendingDelete(recording)}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete “{pendingDelete?.title}”?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.leadCount
                ? `This also deletes ${pendingDelete.leadCount} lead${
                    pendingDelete.leadCount === 1 ? "" : "s"
                  } captured by its gate. Export them first if you need them.`
                : "This cannot be undone."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
