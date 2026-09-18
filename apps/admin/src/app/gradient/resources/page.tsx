"use client";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import ResourcePage from "@/gradient/components/Pages/ResourcePage/ResourcePage";
import { Button } from "@/gradient/components/ui/button";
import { Plus } from "lucide-react";
import { useResourceStore } from "@/gradient/lib/store/useResourceStore";

export default function Page() {
  const { showCreateForm, toggleCreateForm } = useResourceStore();

  return (
    <DashboardLayout
      title="Resources"
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
              Add New Resource
            </>
          )}
        </Button>
      }
    >
      <ResourcePage />
    </DashboardLayout>
  );
}
