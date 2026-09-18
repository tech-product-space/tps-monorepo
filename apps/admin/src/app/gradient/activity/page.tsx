"use client";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import ActivityPage from "@/gradient/components/Pages/ActivityPage/ActivityPage";

export default function Page() {
    return (
        <DashboardLayout title="Activity Log">
            <ActivityPage />
        </DashboardLayout>
    );
}
