"use client";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import RecordingPage from "@/gradient/components/Pages/RecordingPage/RecordingPage";
import { Button } from "@/gradient/components/ui/button";
import { Plus } from "lucide-react";
import { useRecordingStore } from "@/gradient/lib/store/useRecordingStore";

export default function Page() {
  const { showCreateForm, toggleCreateForm } = useRecordingStore();

  return (
    <DashboardLayout
      title="Recordings"
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
              Add New Recording
            </>
          )}
        </Button>
      }
    >
      <RecordingPage />
    </DashboardLayout>
  );
}
