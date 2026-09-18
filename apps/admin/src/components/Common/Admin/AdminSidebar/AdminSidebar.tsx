"use client";

import * as React from "react";
import {
  MessageCircleQuestion,
  NotebookPen,
  Command,
  LayoutDashboard,
  BriefcaseBusiness,
  LucideBadgeDollarSign,
  Settings2,
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
  UserRoundPlus,
  Wallet,
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

export function AdminSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const { user } = useAuth();
  // Was a separate SuperAdminSidebar/`/superadmin` route tree — collapsed into
  // this one role-gated tree (BACKEND-CONSOLIDATION-PLAN.md §7.3 / §9). User
  // Management and Finance/Expenses were the only two sections that were
  // actually Superadmin-exclusive; everything else was identical between the
  // two old trees.
  //
  // `user.role` off the shared session is the admin's CRM-scoped role, not
  // necessarily their TPS-workspace role — those can differ per person, so
  // this reads the tps-specific grant instead (see lib/workspace.ts).
  const isSuperAdmin = getRoleInWorkspace("tps") === "Superadmin";

  // const menuItems = [
  //   {
  //     name: "Dashboard",
  //     icon: <MdSpaceDashboard size={20} />,
  //     link: "/admin/dashboard",
  //   },
  //   { name: "Blogs", icon: <FaBloggerB size={20} />, link: "/admin/blogs" },
  //   { name: "Jobs", icon: <MdOutlineWork size={20} />, link: "/admin/jobs" },
  //   { name: "Quiz", icon: <MdQuiz size={20} />, link: "/admin/quiz" },
  //   {
  //     name: "Events",
  //     icon: <MdEmojiEvents size={20} />,
  //     link: "/admin/events",
  //   },
  // ];

  const data = {
    user: {
      name: user?.name,
      email: user?.email,
      avatar: "/avatars/shadcn.jpg",
    },
    navMain: [
      {
        title: "Dashboard",
        url: "/tps/dashboard",
        icon: LayoutDashboard,
        isActive: true,
      },
      {
        title: "Cohort Members",
        url: "/tps/cohort-members",
        icon: GraduationCap,
      },
      {
        title: "Support Queries",
        url: "/tps/support",
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
            url: "/tps/visitor-tracking",
          },
          {
            title: "All Visitors",
            url: "/tps/visitors",
          },
        ],
      },
      {
        title: "Blogs",
        url: "/tps/blogs",
        icon: NotebookPen,
        isActive: false,
        items: [
          {
            title: "Landing Blogs",
            url: "/tps/landing-blogs",
          },
          {
            title: "Blogs Files",
            url: "/tps/blogs/files",
          },
        ],
      },
      {
        title: "Jobs",
        url: "/tps/jobs",
        icon: BriefcaseBusiness,
      },
      {
        title: "Quiz",
        url: "/tps/quiz",
        icon: MessageCircleQuestion,
      },
      ...(isSuperAdmin
        ? [
            {
              title: "User Management",
              url: "/tps/user-management",
              icon: UserRoundPlus,
            },
          ]
        : []),
      {
        title: "Leads",
        url: "#",
        icon: LucideBadgeDollarSign,
        isActive: false,
        items: [
          {
            title: "Platform Leads",
            url: "/tps/platform-leads",
          },
          {
            title: "Meta Leads",
            url: "/tps/meta-leads",
          },
          {
            title: "Cal Bookings",
            url: "/tps/cal-bookings",
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
            url: "/tps/marketing/campaigns",
          },
          {
            title: "Contacts",
            url: "/tps/marketing/contacts",
          },
          {
            title: "Unsubscribed",
            url: "/tps/marketing/unsubscribed-users",
          },
        ],
      },
      {
        title: "Newsletter",
        url: "/tps/newsletter",
        icon: Mail,
      },
      ...(isSuperAdmin
        ? [
            {
              title: "Finance",
              url: "#",
              icon: Wallet,
              isActive: false,
              items: [
                { title: "Expenses", url: "/tps/expenses" },
                { title: "Dashboard", url: "/tps/expenses/dashboard" },
                { title: "Categories", url: "/tps/expenses/categories" },
                { title: "Recurring", url: "/tps/expenses/recurring" },
                { title: "Forms", url: "/tps/expenses/forms" },
                { title: "Teams", url: "/tps/expenses/teams" },
              ],
            },
          ]
        : []),
      {
        title: "AI Products",
        url: "/tps/ai-products",
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
            url: "/tps/automation/workflows",
          },
          {
            title: "Enrollments",
            url: "/tps/automation/enrollments",
          },
          {
            title: "Settings",
            url: "/tps/automation/workflows/settings",
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
            url: "/tps/referees",
          },
          {
            title: "Public Referrals",
            url: "/tps/referrals",
          },
        ],
      },
      {
        title: "Resumes",
        url: "/tps/resume",
        icon: BookUser,
      },
      {
        title: "Cohort",
        url: "#",
        icon: BadgePercent,
        items: [
          {
            title: "Cohort Details",
            url: "/tps/cohort/offers",
          },
          {
            title: "Enrolment Email",
            url: "/tps/cohort/enrolment-email",
          },
          {
            title: "Curriculum Email",
            url: "/tps/cohort/download-curriculum-email",
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
            url: "/tps/portfolios",
          },
          {
            title: "Projects",
            url: "/tps/portfolios/projects",
          },
          {
            title: "Internal Projects",
            url: "/tps/projects",
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
            url: "/tps/events",
          },
          {
            title: "Past Events",
            url: "/tps/past-events",
          },
        ],
      },
      {
        title: "Resources",
        url: "/tps/resources",
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
            url: "/tps/recordings",
          },
          {
            title: "Categories",
            url: "/tps/recordings/categories",
          },
        ],
      },
      {
        title: "Interview Questions",
        url: "/tps/interview-questions",
        icon: MessagesSquare,
      },
      {
        title: "Free Courses",
        url: "/tps/free-courses",
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
            url: "/tps/integrations/meta",
          },
        ],
      },
      // {
      //   title: "Settings",
      //   url: "#",
      //   icon: Settings2,
      //   isActive: true,
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
                  <span className="truncate text-xs">Admin</span>
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
