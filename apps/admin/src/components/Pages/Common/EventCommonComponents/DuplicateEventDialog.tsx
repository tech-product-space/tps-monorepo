"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  checkSlugAvailability,
  duplicateEvent,
} from "@/services/Events/eventServices";
import { useNotification } from "@/helpers/NotificationContext";

export interface DuplicateEventSource {
  id: number;
  eventTitle: string;
  eventSlug: string;
  eventStartDate: string;
  eventEndDate: string;
  eventStartTime?: string;
  eventEndTime?: string;
}

interface DuplicateEventDialogProps {
  event: DuplicateEventSource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDuplicated: () => void;
  // Extra line shown in the success toast, e.g. to point at another list
  successDescription?: string;
}

// Stored dates are plain YYYY-MM-DD, but tolerate full ISO strings too
const toDateInput = (value?: string) => (value ? value.slice(0, 10) : "");

export default function DuplicateEventDialog({
  event,
  open,
  onOpenChange,
  onDuplicated,
  successDescription = "",
}: DuplicateEventDialogProps) {
  const { showNotification } = useNotification();

  const [eventTitle, setEventTitle] = useState("");
  const [eventSlug, setEventSlug] = useState("");
  const [eventStartDate, setEventStartDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [eventStartTime, setEventStartTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [slugAvailable, setSlugAvailable] = useState<null | boolean>(null);
  const [slugMessage, setSlugMessage] = useState("");
  const [slugLoading, setSlugLoading] = useState(false);

  // Prefill from the source event every time the dialog is opened
  useEffect(() => {
    if (!open || !event) return;

    setEventTitle(event.eventTitle || "");
    setEventSlug(event.eventSlug ? `${event.eventSlug}-copy` : "");
    setEventStartDate(toDateInput(event.eventStartDate));
    setEventEndDate(toDateInput(event.eventEndDate));
    setEventStartTime(event.eventStartTime || "");
    setEventEndTime(event.eventEndTime || "");
    setIsPublished(false);
    setSlugAvailable(null);
    setSlugMessage("");
  }, [open, event]);

  useEffect(() => {
    if (!open) return;

    if (!eventSlug || eventSlug.trim() === "") {
      setSlugAvailable(null);
      setSlugMessage("");
      return;
    }

    const timer = setTimeout(async () => {
      setSlugLoading(true);
      try {
        const res = await checkSlugAvailability(eventSlug);
        setSlugAvailable(res.available);
        setSlugMessage(res.message);
      } catch (error) {
        setSlugAvailable(null);
        setSlugMessage("Error checking slug availability");
      } finally {
        setSlugLoading(false);
      }
    }, 600); // debounce API call

    return () => clearTimeout(timer);
  }, [eventSlug, open]);

  const handleDuplicate = async () => {
    if (!event) return;

    if (!eventTitle.trim()) {
      showNotification("error", "Event name is required", "");
      return;
    }
    if (!eventSlug.trim()) {
      showNotification("error", "Event URL is required", "");
      return;
    }
    if (slugAvailable === false) {
      showNotification("error", "This event URL is already taken", "");
      return;
    }
    if (!eventStartDate || !eventEndDate) {
      showNotification("error", "Start date and end date are required", "");
      return;
    }
    if (new Date(eventEndDate) < new Date(eventStartDate)) {
      showNotification("error", "End date cannot be before start date", "");
      return;
    }

    try {
      setSubmitting(true);
      await duplicateEvent(String(event.id), {
        eventTitle: eventTitle.trim(),
        eventSlug: eventSlug.trim(),
        eventStartDate,
        eventEndDate,
        eventStartTime,
        eventEndTime,
        isPublished,
      });
      showNotification(
        "success",
        "Event Duplicated Successfully",
        successDescription
      );
      onOpenChange(false);
      onDuplicated();
    } catch (error: any) {
      console.error("Event duplication failed", error);
      showNotification(
        "error",
        error?.response?.data?.error || "Failed to duplicate the event",
        ""
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Duplicate Event</DialogTitle>
          <DialogDescription>
            Creates a new event with the same page content, speakers, banner,
            enrollment emails and certificate template. Guests, feedback and
            reminder emails are not copied.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="duplicate-title">Event Name</Label>
            <Input
              id="duplicate-title"
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              placeholder="Enter event title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="duplicate-slug">Event URL</Label>
            <div className="relative">
              <Input
                id="duplicate-slug"
                value={eventSlug}
                onChange={(e) => setEventSlug(e.target.value)}
                placeholder="Enter the URL of the page"
              />
              {slugLoading && (
                <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-gray-400" />
              )}
            </div>
            {slugAvailable !== null && (
              <p
                className={`text-sm ${
                  slugAvailable ? "text-green-600" : "text-red-600"
                }`}
              >
                {slugMessage}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duplicate-start-date">Start Date</Label>
              <Input
                id="duplicate-start-date"
                type="date"
                value={eventStartDate}
                onChange={(e) => setEventStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duplicate-end-date">End Date</Label>
              <Input
                id="duplicate-end-date"
                type="date"
                value={eventEndDate}
                onChange={(e) => setEventEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duplicate-start-time">Start Time</Label>
              <Input
                id="duplicate-start-time"
                type="time"
                value={eventStartTime}
                onChange={(e) => setEventStartTime(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="duplicate-end-time">End Time</Label>
              <Input
                id="duplicate-end-time"
                type="time"
                value={eventEndTime}
                onChange={(e) => setEventEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-gray-200 p-3">
            <div className="space-y-0.5">
              <Label htmlFor="duplicate-publish">Publish immediately</Label>
              <p className="text-sm text-gray-500">
                Leave off to create the copy as a draft.
              </p>
            </div>
            <Switch
              id="duplicate-publish"
              checked={isPublished}
              onCheckedChange={setIsPublished}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={handleDuplicate}
            disabled={submitting || slugLoading}
          >
            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Duplicate Event
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
