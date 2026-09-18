"use client";

import * as React from "react";
import {
  MessageCircleQuestion,
  NotebookPen,
  Command,
  LayoutDashboard,
  BriefcaseBusiness,
  UserRoundPlus,
  LucideBadgeDollarSign,
  Network,
  BookUser,
  BadgePercent,
  ShieldUser,
  BookImage,
  BookOpen,
} from "lucide-react";

import { NavMain } from "@/components/Common/SuperAdmin/NavMain/NavMain";
import { NavUser } from "@/components/Common/SuperAdmin/NavUser/NavUser";
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

export function SalesSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth();

  const data = {
    user: {
      name: user?.name,
      email: user?.email,
      avatar: "/avatars/shadcn.jpg",
    },
    navMain: [
      {
        title: "Dashboard",
        url: "/tps/sales/dashboard",
        icon: LayoutDashboard,
        isActive: true,
      },
      {
        title: "Leads",
        url: "#",
        icon: LucideBadgeDollarSign,
        isActive: false,
        items: [
          {
            title: "Form Leads",
            url: "/tps/sales/form-leads",
          },
          {
            title: "Platform Leads",
            url: "/tps/sales/platform-leads",
          },
        ],
      },
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
                  <span className="truncate text-xs">Sales</span>
                </div>
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  );
}
