"use client";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import SubscribersPage from "@/gradient/components/Pages/Subscribers/SubscribersPage";

export default function Page() {
    return (
        <DashboardLayout title="Subscribers">
            <SubscribersPage />
        </DashboardLayout>
    );
}
