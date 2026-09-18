"use client";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import EnrollmentList from "@/gradient/components/Pages/MarketingPage/AutomationsTab/EnrollmentList";

export default function Page() {
  return (
    <DashboardLayout title="Enrolments">
      {/* Across every automation, so the workflow column earns its place here
          and is hidden on the editor's tab. */}
      <EnrollmentList showWorkflowColumn showSearch />
    </DashboardLayout>
  );
}
