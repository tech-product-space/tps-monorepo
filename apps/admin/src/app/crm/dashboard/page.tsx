"use client";

// Ported from tps-crm/src/pages/DashboardHome (a Vite + react-router SPA) —
// see @/crm/dashboard/DashboardHome.tsx and README.md "CRM workspace" for
// what this proves and what's still to come. This one page is real: it
// calls the CRM backend through the same unified PrivateAxios/auth every
// other workspace uses, not a mock.
import { DashboardHome } from "@/crm/dashboard/DashboardHome";

export default function CrmDashboardPage() {
  return <DashboardHome />;
}
