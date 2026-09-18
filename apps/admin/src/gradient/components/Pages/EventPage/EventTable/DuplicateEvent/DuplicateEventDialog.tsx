"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { Switch } from "@/gradient/components/ui/switch";
import { useSlugAvailability } from "@/gradient/hooks/useSlugAvailability";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { eventService } from "@/gradient/services/eventService";
import { EventResponse } from "@/gradient/types/event";

interface DuplicateEventDialogProps {
  /** The event being copied. `null` keeps the dialog closed. */
  event: EventResponse | null;
  onClose: () => void;
  onDuplicated: () => void;
}

/**
 * The form is a separate, keyed component so opening the dialog on a different
 * event remounts it — prefilled state comes straight from `useState`
 * initialisers rather than an effect that resets it after the first render.
 */
export default function DuplicateEventDialog({
  event,
  onClose,
  onDuplicated,
}: DuplicateEventDialogProps) {
  if (!event) return null;

  return (
    <DuplicateEventForm
      key={event.id}
      event={event}
      onClose={onClose}
      onDuplicated={onDuplicated}
    />
  );
}

function DuplicateEventForm({
  event,
  onClose,
  onDuplicated,
}: DuplicateEventDialogProps & { event: EventResponse }) {
  const router = useRouter();

  const [eventTitle, setEventTitle] = useState(event.eventTitle);
  // The slug has to differ — it is unique — so seed a distinct one rather than
  // a duplicate the availability check would immediately reject.
  const [eventSlug, setEventSlug] = useState(`${event.eventSlug}-copy`);
  // Dates start empty on purpose. A copy exists to be run again, and silently
  // inheriting the original's dates is the one mistake that would publish an
  // event onto a day nobody chose.
  const [eventStartDate, setEventStartDate] = useState("");
  const [eventEndDate, setEventEndDate] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [saving, setSaving] = useState(false);

  const { slugAvailable, checkingSlug } = useSlugAvailability(
    eventSlug,
    eventService.checkSlugAvailability,
  );

  const datesOutOfOrder =
    !!eventStartDate && !!eventEndDate && eventEndDate < eventStartDate;

  const canSubmit =
    eventTitle.trim() !== "" &&
    eventSlug.trim() !== "" &&
    eventStartDate !== "" &&
    eventEndDate !== "" &&
    !datesOutOfOrder &&
    slugAvailable !== false &&
    !checkingSlug &&
    !saving;

  const handleDuplicate = async () => {
    setSaving(true);
    const toastId = toast.loading("Duplicating event...");

    try {
      const created = await eventService.duplicateEvent(event.id, {
        eventTitle: eventTitle.trim(),
        eventSlug: eventSlug.trim(),
        eventStartDate,
        eventEndDate,
        isPublished,
      });

      toast.success("Event duplicated successfully!", { id: toastId });
      onDuplicated();
      onClose();
      // Straight to the copy's editor — the list on this page only shows
      // upcoming events, so a copy dated otherwise would appear to have
      // vanished, and editing it is the next step regardless.
      router.push(`/events/${created.id}`);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Failed to duplicate event."), {
        id: toastId,
      });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Duplicate event</DialogTitle>
          <DialogDescription>
            Copies everything from &ldquo;{event.eventTitle}&rdquo; — page
            details, speakers, creative, SEO, settings, email templates and the
            certificate template. Registrations, feedback, issued certificates
            and reminders are not copied.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="duplicate-title">Event Title</Label>
            <Input
              id="duplicate-title"
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              placeholder="Enter event title"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="duplicate-slug">URL Slug</Label>
            <div className="relative">
              <Input
                id="duplicate-slug"
                value={eventSlug}
                onChange={(e) => setEventSlug(e.target.value)}
                placeholder="event-url-slug"
                className={
                  slugAvailable === false
                    ? "border-red-500 focus-visible:ring-red-500 pr-10"
                    : slugAvailable === true
                      ? "border-green-500 focus-visible:ring-green-500 pr-10"
                      : "pr-10"
                }
              />
              <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                {checkingSlug ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                ) : slugAvailable === true ? (
                  <Check className="w-4 h-4 text-green-500" />
                ) : slugAvailable === false ? (
                  <X className="w-4 h-4 text-red-500" />
                ) : null}
              </div>
            </div>
            {slugAvailable === false && (
              <p className="text-sm text-red-500">This slug is already taken.</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="duplicate-start">Start Date</Label>
              <Input
                id="duplicate-start"
                type="date"
                value={eventStartDate}
                onChange={(e) => setEventStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="duplicate-end">End Date</Label>
              <Input
                id="duplicate-end"
                type="date"
                value={eventEndDate}
                onChange={(e) => setEventEndDate(e.target.value)}
              />
            </div>
          </div>

          {datesOutOfOrder && (
            <p className="text-sm text-red-500">
              End date cannot be before the start date.
            </p>
          )}

          <div className="flex items-center justify-between rounded-md border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="duplicate-publish">Publish immediately</Label>
              <p className="text-xs text-muted-foreground">
                Off by default — the copy stays a draft until you have checked
                the dates and content.
              </p>
            </div>
            <Switch
              id="duplicate-publish"
              checked={isPublished}
              onCheckedChange={setIsPublished}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleDuplicate} disabled={!canSubmit}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Duplicate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
