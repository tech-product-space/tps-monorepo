"use client";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import BlogPage from "@/gradient/components/Pages/BlogPage/BlogPage";
import { Button } from "@/gradient/components/ui/button";
import { Plus } from "lucide-react";
import { useBlogStore } from "@/gradient/lib/store/useBlogStore";

export default function Page() {
  const { showCreateForm, toggleCreateForm } = useBlogStore();

  return (
    <DashboardLayout
      title="Blog"
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
              Add New Blog
            </>
          )}
        </Button>
      }
    >
      <BlogPage />
    </DashboardLayout>
  );
}
