import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { CrmSidebar } from "@/components/Common/Crm/CrmSidebar/CrmSidebar";

// CRM workspace shell. Auth and the workspace grant check both already run
// at the app level (AuthProvider in app/layout.tsx, gate in middleware.ts) —
// this layout only needs to render the CRM-specific chrome, same shape as
// tps/layout.tsx.
export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider className="h-screen overflow-hidden">
      <CrmSidebar />
      <SidebarInset className="m-0 overflow-hidden">
        <main className="flex h-screen flex-col overflow-hidden rounded-2xl">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
