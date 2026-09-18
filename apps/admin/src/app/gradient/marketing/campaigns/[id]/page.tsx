"use client";

import CampaignEditor from "@/gradient/components/Pages/MarketingPage/CampaignEditor/CampaignEditor";

// CampaignEditor renders DashboardLayout itself, so the campaign name, its
// status badge and the Send button can live in the app's top bar rather than a
// second header stacked inside the page.
export default function Page() {
    return <CampaignEditor />;
}
