"use client";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import LeadsPage from "@/gradient/components/Pages/Leads/LeadsPage";

export default function Page() {
    return (
        <DashboardLayout
            title="Leads"
        >
            <LeadsPage />
        </DashboardLayout>
    );
}
