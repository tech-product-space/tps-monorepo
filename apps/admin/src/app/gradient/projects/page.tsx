"use client";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import ProjectPage from "@/gradient/components/Pages/ProjectPage/ProjectPage";
import { Button } from "@/gradient/components/ui/button";
import { Plus } from "lucide-react";
import { useProjectStore } from "@/gradient/lib/store/useProjectStore";

export default function Page() {
  const { showCreateForm, toggleCreateForm } = useProjectStore();

  return (
    <DashboardLayout
      title="Projects"
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
              Add New Project
            </>
          )}
        </Button>
      }
    >
      <ProjectPage />
    </DashboardLayout>
  );
}
