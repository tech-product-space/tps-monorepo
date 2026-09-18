"use client";

import DashboardLayout from "@/gradient/components/DashboardLayout";

import { Button } from "@/gradient/components/ui/button";
import { Plus } from "lucide-react";
import FreeCoursePage from "@/gradient/components/Pages/FreeCoursePage/FreeCoursePage";
import { useFreeCourseStore } from "@/gradient/lib/store/useFreeCourseStore";

export default function Page() {
  const { showCreateForm, toggleCreateForm } = useFreeCourseStore();

  return (
    <DashboardLayout
      title="Free Courses"
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
              Add New Free Course
            </>
          )}
        </Button>
      }
    >
      <FreeCoursePage />
    </DashboardLayout>
  );
}
