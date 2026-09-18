import { CreatorSidebar } from "@/components/Common/Creator/CreatorSidebar/CreatorSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Admin - Dashboard",
  description: "The Product Space - Admin Dashboard",
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider className="h-screen overflow-hidden">
      <CreatorSidebar />
      <SidebarInset className="m-0">
        <main className="flex-1 overflow-hidden rounded-2xl">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
