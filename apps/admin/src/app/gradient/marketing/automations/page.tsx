"use client";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import AutomationsTab from "@/gradient/components/Pages/MarketingPage/AutomationsTab/AutomationsTab";

export default function Page() {
  return (
    <DashboardLayout title="Automations">
      <AutomationsTab />
    </DashboardLayout>
  );
}
