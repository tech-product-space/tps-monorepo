"use client";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import AutomationSettings from "@/gradient/components/Pages/MarketingPage/AutomationsTab/AutomationSettings";

export default function Page() {
  return (
    <DashboardLayout title="Automation settings">
      <AutomationSettings />
    </DashboardLayout>
  );
}
