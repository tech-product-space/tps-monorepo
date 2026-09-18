"use client";

import { useState, useEffect, useCallback } from "react";
import { useEventStore } from "@/gradient/lib/store/useEventStore";
import { eventService } from "@/gradient/services/eventService";
import { EventResponse } from "@/gradient/types/event";
import AddEvent from "./AddEvent/AddEvent";
import EventTable from "./EventTable/EventTable";

export default function EventPage() {
  const { showCreateForm } = useEventStore();
  const [events, setEvents] = useState<EventResponse[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    setFetchLoading(true);
    try {
      const data = await eventService.getAllEvents();
      setEvents(data);
    } catch (error) {
      console.error("Error fetching events:", error);
    } finally {
      setFetchLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return (
    <div className="space-y-8">
      {showCreateForm && <AddEvent onSuccess={fetchEvents} />}
      <EventTable
        events={events}
        fetchEvents={fetchEvents}
        fetchLoading={fetchLoading}
      />
    </div>
  );
}
