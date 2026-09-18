"use client";

import { use } from "react";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import EnrollmentDetail from "@/gradient/components/Pages/MarketingPage/AutomationsTab/EnrollmentDetail";

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  return (
    <DashboardLayout title="Enrolment">
      <EnrollmentDetail id={id} />
    </DashboardLayout>
  );
}
