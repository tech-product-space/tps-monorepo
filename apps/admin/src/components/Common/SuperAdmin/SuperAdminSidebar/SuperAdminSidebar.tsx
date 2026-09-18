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
  Video,
  MessagesSquare,
  Users,
  GraduationCap,
  Library,
  Plug2,
  Megaphone,
  Workflow,
  Mail,
  Bot,
  Headset,
  Wallet,
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

export function SuperAdminSidebar({
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
        url: "/superadmin/dashboard",
        icon: LayoutDashboard,
        isActive: true,
      },
      {
        title: "Cohort Members",
        url: "/superadmin/cohort-members",
        icon: GraduationCap,
      },
      {
        title: "Support Queries",
        url: "/superadmin/support",
        icon: Headset,
      },
      {
        title: "Visitors",
        url: "#",
        icon: Users,
        isActive: false,
        items: [
          {
            title: "Visitor Tracking",
            url: "/superadmin/visitor-tracking",
          },
          {
            title: "All Visitors",
            url: "/superadmin/visitors",
          },
        ],
      },
      {
        title: "All Blogs",
        url: "#",
        icon: NotebookPen,
        isActive: false,
        items: [
          {
            title: "Blogs",
            url: "/superadmin/blogs",
          },
          {
            title: "Landing Blogs",
            url: "/superadmin/landing-blogs",
          },
          {
            title: "Blogs Files",
            url: "/superadmin/blogs/files",
          },
        ],
      },
      {
        title: "Jobs",
        url: "/superadmin/jobs",
        icon: BriefcaseBusiness,
      },
      {
        title: "Quiz",
        url: "/superadmin/quiz",
        icon: MessageCircleQuestion,
      },
      {
        title: "User Management",
        url: "/superadmin/user-management",
        icon: UserRoundPlus,
      },
      {
        title: "Leads",
        url: "#",
        icon: LucideBadgeDollarSign,
        isActive: false,
        items: [
          {
            title: "Platform Leads",
            url: "/superadmin/platform-leads",
          },
          {
            title: "Meta Leads",
            url: "/superadmin/meta-leads",
          },
          {
            title: "Cal Bookings",
            url: "/superadmin/cal-bookings",
          },
        ],
      },
      {
        title: "Marketing",
        url: "#",
        icon: Megaphone,
        isActive: false,
        items: [
          {
            title: "Campaigns",
            url: "/superadmin/marketing/campaigns",
          },
          {
            title: "Contacts",
            url: "/superadmin/marketing/contacts",
          },
          {
            title: "Unsubscribed",
            url: "/superadmin/marketing/unsubscribed-users",
          },
        ],
      },
      {
        title: "Finance",
        url: "#",
        icon: Wallet,
        isActive: false,
        items: [
          {
            title: "Expenses",
            url: "/superadmin/expenses",
          },
          {
            title: "Dashboard",
            url: "/superadmin/expenses/dashboard",
          },
          {
            title: "Categories",
            url: "/superadmin/expenses/categories",
          },
          {
            title: "Recurring",
            url: "/superadmin/expenses/recurring",
          },
          {
            title: "Forms",
            url: "/superadmin/expenses/forms",
          },
          {
            title: "Teams",
            url: "/superadmin/expenses/teams",
          },
        ],
      },
      {
        title: "Newsletter",
        url: "/superadmin/newsletter",
        icon: Mail,
      },
            {
        title: "AI Products",
        url: "/superadmin/ai-products",
        icon: Bot,
      },
      {
        title: "Automation",
        url: "#",
        icon: Workflow,
        isActive: false,
        items: [
          {
            title: "Workflows",
            url: "/superadmin/automation/workflows",
          },
          {
            title: "Enrollments",
            url: "/superadmin/automation/enrollments",
          },
          {
            title: "Settings",
            url: "/superadmin/automation/workflows/settings",
          },
        ],
      },
      {
        title: "Referrals",
        url: "#",
        icon: Network,
        isActive: false,
        items: [
          {
            title: "Referees",
            url: "/superadmin/referees",
          },
          {
            title: "Public Referrals",
            url: "/superadmin/referrals",
          },
        ],
      },
      {
        title: "Resumes",
        url: "/superadmin/resume",
        icon: BookUser,
      },
      {
        title: "Cohort",
        url: "#",
        icon: BadgePercent,
        items: [
          {
            title: "Cohort Details",
            url: "/superadmin/cohort/offers",
          },
          {
            title: "Enrolment Email",
            url: "/superadmin/cohort/enrolment-email",
          },
          {
            title: "Curriculum Email",
            url: "/superadmin/cohort/download-curriculum-email",
          },
        ],
      },
      {
        title: "Portfolio Projects",
        url: "#",
        icon: ShieldUser,
        isActive: false,
        items: [
          {
            title: "All Portfolio",
            url: "/superadmin/portfolios",
          },
          {
            title: "Projects",
            url: "/superadmin/portfolios/projects",
          },
          {
            title: "Internal Projects",
            url: "/superadmin/projects",
          },
        ],
      },
      {
        title: "Events",
        url: "#",
        icon: BookImage,
        isActive: false,
        items: [
          {
            title: "Upcoming Events",
            url: "/superadmin/events",
          },
          {
            title: "Past Events",
            url: "/superadmin/past-events",
          },
        ],
      },

      {
        title: "Resources",
        url: "/superadmin/resources",
        icon: BookOpen,
      },
      {
        title: "Recordings",
        url: "#",
        icon: Video,
        isActive: false,
        items: [
          {
            title: "All Recordings",
            url: "/superadmin/recordings",
          },
          {
            title: "Categories",
            url: "/superadmin/recordings/categories",
          },
        ],
      },
      {
        title: "Interview Questions",
        url: "/superadmin/interview-questions",
        icon: MessagesSquare,
      },
      {
        title: "Free Courses",
        url: "/superadmin/free-courses",
        icon: Library,
        isActive: true,
      },
      {
        title: "Integrations",
        url: "#",
        icon: Plug2,
        isActive: false,
        items: [
          {
            title: "Meta",
            url: "/superadmin/integrations/meta",
          },
        ],
      },
      // {
      //   title: "Settings",
      //   url: "#",
      //   icon: Settings2,
      //   items: [
      //     {
      //       title: "General",
      //       url: "#",
      //     },
      //     {
      //       title: "Team",
      //       url: "#",
      //     },
      //     {
      //       title: "Billing",
      //       url: "#",
      //     },
      //     {
      //       title: "Limits",
      //       url: "#",
      //     },
      //   ],
      // },
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
      <SidebarContent className="flex-1 overflow-y-auto sidebar-scroll">
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  );
}
