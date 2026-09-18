"use client";

import * as React from "react";
import {
  Command,
  LayoutDashboard,
  BookUser,
  BadgePercent,
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

export function CreatorSidebar({
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
        url: "/tps/creator/dashboard",
        icon: LayoutDashboard,
        isActive: true,
      },
      {
        title: "Resumes",
        url: "/tps/creator/resume",
        icon: BookUser,
      },
      {
        title: "Program Offers",
        url: "/tps/creator/offers",
        icon: BadgePercent,
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
                  <span className="truncate text-xs">Super Admin</span>
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
