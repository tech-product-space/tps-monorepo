import { AdminSidebar } from "@/components/Common/Admin/AdminSidebar/AdminSidebar";
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
      <AdminSidebar />
      <SidebarInset className="m-0 overflow-hidden">
        <main className="flex h-screen flex-col overflow-hidden rounded-2xl">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
