"use client";

import { use } from "react";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import StepContentPage from "@/gradient/components/Pages/ProjectPage/StepContentPage";

export default function Page({
  params,
}: {
  params: Promise<{ id: string; stepId: string }>;
}) {
  const { id, stepId } = use(params);

  return (
    <DashboardLayout title="Guide step">
      <StepContentPage projectId={id} stepId={stepId} />
    </DashboardLayout>
  );
}
