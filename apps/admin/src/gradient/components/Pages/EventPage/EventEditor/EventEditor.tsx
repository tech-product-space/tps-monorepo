"use client";

import { useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

import DashboardLayout from "@/gradient/components/DashboardLayout";

import { eventService } from "@/gradient/services/eventService";
import { EventResponse } from "@/gradient/types/event";
import { EventDetailPage } from "./EventDetailPage/EventDetailPage";
import { Button } from "@/gradient/components/ui/button";

export default function EventEditor({ eventId }: { eventId: string }) {
  const [event, setEvent] = useState<EventResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadEvent = async () => {
      try {
        const response = await eventService.getEventById(eventId);
        setEvent(response);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadEvent();
  }, [eventId]);

  if (loading) {
    return (
      <DashboardLayout title="Event Edit">
        <div className="flex items-center justify-center p-20">
          <Loader2 className="animate-spin h-6 w-6" />
        </div>
      </DashboardLayout>
    );
  }

  if (!event) {
    return (
      <DashboardLayout title="Event Edit">
        <div className="p-6 text-center">
          <h2 className="text-xl font-semibold">Event not found</h2>
          <p className="text-muted-foreground">
            The requested event could not be retrieved.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout
      title="Event Edit"
      actions={
        <Button
          variant="outline"
          onClick={() =>
            window.open(
              `http://gradientlearnings.org/events/${event.eventSlug}`,
              "_blank",
            )
          }
          className="flex items-center gap-2 px-3 py-1.5 text-sm"
        >
          Event Page
          <ExternalLink className="h-4 w-4" />
        </Button>
      }
    >
      <EventDetailPage event={event} />
    </DashboardLayout>
  );
}
