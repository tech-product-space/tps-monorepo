"use client";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import ProjectSubmissionsPage from "@/gradient/components/Pages/ProjectPage/ProjectSubmissionsPage";

export default function Page() {
  return (
    <DashboardLayout title="Project submissions">
      <ProjectSubmissionsPage />
    </DashboardLayout>
  );
}
