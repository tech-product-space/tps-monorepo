"use client";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import ProjectCategoriesPage from "@/gradient/components/Pages/ProjectPage/ProjectCategoriesPage";

export default function Page() {
  return (
    <DashboardLayout title="Project categories">
      <ProjectCategoriesPage />
    </DashboardLayout>
  );
}
