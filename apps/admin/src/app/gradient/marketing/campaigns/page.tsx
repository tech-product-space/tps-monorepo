"use client";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import CampaignsTab from "@/gradient/components/Pages/MarketingPage/CampaignsTab/CampaignsTab";

export default function Page() {
    return (
        <DashboardLayout title="Campaigns">
            <CampaignsTab />
        </DashboardLayout>
    );
}
