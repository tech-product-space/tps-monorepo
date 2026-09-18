"use client";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import PastEventPage from "@/gradient/components/Pages/EventPage/PastEventPage";

export default function Page() {

  return (
    <DashboardLayout
      title="Past Events"
    >
      <PastEventPage />
    </DashboardLayout>
  );
}
