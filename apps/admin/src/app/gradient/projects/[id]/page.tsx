"use client";

import { use } from "react";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import ProjectDetailPage from "@/gradient/components/Pages/ProjectPage/ProjectDetailPage";

export default function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <DashboardLayout title="Project">
      <ProjectDetailPage id={id} />
    </DashboardLayout>
  );
}
