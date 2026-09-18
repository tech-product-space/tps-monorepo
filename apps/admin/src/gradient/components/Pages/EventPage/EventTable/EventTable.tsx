"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import { Badge } from "@/gradient/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import { Button } from "@/gradient/components/ui/button";
import { Copy, Edit, Loader2, RefreshCcw, Trash2, Eye } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { EventResponse } from "@/gradient/types/event";
import { eventService } from "@/gradient/services/eventService";
import { ToggleEventPublish } from "./ToggleEventPublish/ToggleEventPublish";
import DuplicateEventDialog from "./DuplicateEvent/DuplicateEventDialog";

interface EventTableProps {
  events: EventResponse[];
  fetchEvents: () => void;
  fetchLoading: boolean;
}

export default function EventTable({
  events,
  fetchEvents,
  fetchLoading,
}: EventTableProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [duplicating, setDuplicating] = useState<EventResponse | null>(null);
  const router = useRouter();

  const handleManage = (id: string) => {
    router.push(`/events/manage/${id}`);
  };

  const handleEdit = (id: string) => {
    router.push(`/events/${id}`);
  };

  const handleDelete = (event: EventResponse) => {
    toast(`Delete "${event.eventTitle}"?`, {
      description: "This action cannot be undone.",
      duration: 8000,
      action: {
        label: "Delete",
        onClick: () => confirmDelete(event.id),
      },
      cancel: {
        label: "Cancel",
        onClick: () => {},
      },
    });
  };

  const confirmDelete = async (id: string) => {
    setDeletingId(id);
    const toastId = toast.loading("Deleting event...");
    try {
      await eventService.deleteEvent(id);
      toast.success("Event deleted successfully!", { id: toastId });
      fetchEvents();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to delete event.", {
        id: toastId,
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>All Events</CardTitle>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchEvents}
          disabled={fetchLoading}
        >
          <RefreshCcw
            className={`w-4 h-4 ${fetchLoading ? "animate-spin" : ""}`}
          />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Date & Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fetchLoading ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading events...
                    </div>
                  </TableCell>
                </TableRow>
              ) : events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center">
                    No events found.
                  </TableCell>
                </TableRow>
              ) : (
                events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="font-medium">
                      <div>
                        <p>{event.eventTitle}</p>
                        <p className="text-xs text-muted-foreground font-normal truncate max-w-[300px]">
                          {event.eventSubtitle}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{event.eventType}</Badge>
                    </TableCell>
                    <TableCell>
                      {event.eventStartDate ? (
                        <div className="flex flex-col text-sm">
                          <span>
                            {new Date(event.eventStartDate).toLocaleDateString(
                              "en-IN",
                            )}{" "}
                            {event.eventStartTime &&
                              new Date(
                                `1970-01-01T${event.eventStartTime}`,
                              ).toLocaleTimeString("en-IN", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                          </span>

                          <span className="text-gray-400">
                            {event.eventEndDate
                              ? new Date(event.eventEndDate).toLocaleDateString(
                                  "en-IN",
                                )
                              : "N/A"}{" "}
                            {event.eventEndTime &&
                              new Date(
                                `1970-01-01T${event.eventEndTime}`,
                              ).toLocaleTimeString("en-IN", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                          </span>
                        </div>
                      ) : (
                        "N/A"
                      )}
                    </TableCell>
                    <TableCell>
                      <ToggleEventPublish
                        eventId={event.id}
                        isPublished={event.isPublished}
                        refetch={fetchEvents}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-primary"
                        onClick={() => handleManage(event.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-primary"
                        onClick={() => handleEdit(event.id)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title="Duplicate event"
                        className="text-muted-foreground hover:text-primary"
                        onClick={() => setDuplicating(event)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={deletingId === event.id}
                        onClick={() => handleDelete(event)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        {deletingId === event.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      <DuplicateEventDialog
        event={duplicating}
        onClose={() => setDuplicating(null)}
        onDuplicated={fetchEvents}
      />
    </Card>
  );
}
