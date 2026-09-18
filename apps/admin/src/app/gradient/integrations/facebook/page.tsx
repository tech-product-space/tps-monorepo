"use client";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import FacebookSettingsPage from "@/gradient/components/Pages/MetaSettings/FacebookSettingsPage";

export default function Page() {
  return (
    <DashboardLayout title="Facebook Integration">
      <FacebookSettingsPage />
    </DashboardLayout>
  );
}
