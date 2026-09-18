"use client";

import * as React from "react";
import {
  LayoutGrid,
  UserSearch,
  GraduationCap,
  Wallet,
  FileText,
  ClipboardList,
  Video,
  ChartColumn,
  Users,
  Settings,
  Plug,
  Command,
} from "lucide-react";

import { NavMain } from "@/components/Common/Admin/NavMain/NavMain";
import { NavUser } from "@/components/Common/Admin/NavUser/NavUser";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/helpers/AuthContext";
import { WorkspaceSwitcher } from "@/components/Common/WorkspaceSwitcher/WorkspaceSwitcher";
import { getRoleInWorkspace } from "@/lib/workspace";

/**
 * CRM workspace nav. Mirrors tps-crm's DashboardLayout.tsx nav list (see
 * BACKEND-CONSOLIDATION-PLAN.md §7.3/§7.4) — item paths and roles match its
 * original Vite/react-router app exactly. Only Dashboard is wired to a real
 * page so far; the rest still need their page content ported from
 * tps-crm/src/pages/* (a Vite + react-router SPA, not Next.js — see
 * app/crm/dashboard/page.tsx and README.md "CRM workspace" for the reason
 * this is its own follow-up phase rather than done in this pass). Routing
 * here already, though a page 404s until ported, keeps the switcher and nav
 * honest about what the CRM workspace will contain.
 */
export function CrmSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth();
  const role = getRoleInWorkspace("crm");
  const isManager = role === "Manager";

  const data = {
    user: {
      name: user?.name,
      email: user?.email,
      avatar: "/avatars/shadcn.jpg",
    },
    navMain: [
      { title: "Dashboard", url: "/crm/dashboard", icon: LayoutGrid, isActive: true },
      { title: "Boards", url: "/crm/boards", icon: LayoutGrid },
      { title: "All Leads", url: "/crm/leads", icon: UserSearch },
      { title: "Enrollments", url: "/crm/enrollments", icon: GraduationCap },
      { title: "Payments", url: "/crm/payments", icon: Wallet },
      { title: "Invoices", url: "/crm/invoices", icon: FileText },
      { title: "Student Profiles", url: "/crm/student-profiles", icon: ClipboardList },
      { title: "Meetings", url: "/crm/meetings", icon: Video },
      { title: "Reports", url: "/crm/reports", icon: ChartColumn },
      {
        title: isManager ? "My Team" : "Users",
        url: "/crm/settings/users",
        icon: Users,
      },
      { title: "Settings", url: "/crm/crm-settings", icon: Settings },
      { title: "Integrations", url: "/crm/settings/integrations", icon: Plug },
    ],
  };

  return (
    <Sidebar variant="inset" {...props} collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="#">
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg">
                  <Command className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-bold">The Product Space</span>
                  <span className="truncate text-xs">CRM</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <WorkspaceSwitcher />
      </SidebarHeader>
      <SidebarContent className="flex-1 overflow-y-auto sidebar-scroll">
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  );
}
