"use client";

import { Suspense, use } from "react";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import AutomationEditor from "@/gradient/components/Pages/MarketingPage/AutomationsTab/Editor/AutomationEditor";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <DashboardLayout title="Automation">
      {/* The editor reads the open tab from the query string, and Next needs a
          boundary around any component that does — without one the whole route
          silently opts out of static rendering. */}
      <Suspense fallback={null}>
        <AutomationEditor id={id} />
      </Suspense>
    </DashboardLayout>
  );
}
