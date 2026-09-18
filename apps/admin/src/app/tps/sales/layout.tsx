import { SalesSidebar } from "@/components/Common/Sales/SalesSidebar/SalesSidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sales - Dashboard",
  description: "The Product Space - Sales Dashboard",
};

export default function SalesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider className="h-screen overflow-hidden">
      <SalesSidebar />
      <SidebarInset className="m-0">
        <main className="flex-1 overflow-hidden rounded-2xl">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
