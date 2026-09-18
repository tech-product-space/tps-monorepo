"use client";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import ContactsTab from "@/gradient/components/Pages/MarketingPage/ContactsTab/ContactsTab";

export default function Page() {
    return (
        <DashboardLayout title="Contacts">
            <ContactsTab />
        </DashboardLayout>
    );
}
