"use client";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import EventPage from "@/gradient/components/Pages/EventPage/EventPage";
import { Button } from "@/gradient/components/ui/button";
import { Plus } from "lucide-react";
import { useEventStore } from "@/gradient/lib/store/useEventStore";

export default function Page() {
  const { showCreateForm, toggleCreateForm } = useEventStore();

  return (
    <DashboardLayout
      title="Events"
      actions={
        <Button
          onClick={toggleCreateForm}
          variant={showCreateForm ? "outline" : "default"}
        >
          {showCreateForm ? (
            "Cancel"
          ) : (
            <>
              <Plus className="mr-2 h-4 w-4" />
              Add New Event
            </>
          )}
        </Button>
      }
    >
      <EventPage />
    </DashboardLayout>
  );
}
