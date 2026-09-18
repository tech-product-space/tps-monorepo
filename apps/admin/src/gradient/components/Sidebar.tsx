"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/gradient/components/ui/button";
import { Avatar, AvatarFallback } from "@/gradient/components/ui/avatar";
import { ScrollArea } from "@/gradient/components/ui/scroll-area";
import { useAuth } from "@/gradient/context/AuthContext";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/gradient/components/ui/dropdown-menu";
import { useState } from "react";
import { WorkspaceSwitcherCompact } from "@/components/Common/WorkspaceSwitcher/WorkspaceSwitcherCompact";
import {
  BookOpen,
  Briefcase,
  FolderGit2,
  Calendar,
  ChevronDown,
  Facebook,
  FileText,
  GraduationCap,
  History,
  Inbox,
  LayoutDashboard,
  Library,
  Video,
  Tags,
  Mail,
  Megaphone,
  Send,
  Plug,
  Target,
  Users,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  role?: string;
  /**
   * Match the path exactly instead of by prefix.
   *
   * Needed when a sibling lives *under* this item's href: /leads/meta is inside
   * /leads, so without this both Website Leads and Meta Leads highlight at once.
   */
  exact?: boolean;
  /** A group. The parent is a disclosure toggle, not a link of its own. */
  children?: NavItem[];
}

// Ordered in three blocks — what we sell, who is buying, then admin.
const navItems: NavItem[] = [
  { label: "Overview", href: "/gradient/dashboard", icon: LayoutDashboard },
  { label: "Courses", href: "/gradient/courses", icon: BookOpen },
  { label: "Free Courses", href: "/gradient/free-courses", icon: GraduationCap },
  {
    label: "Events",
    href: "/gradient/events",
    icon: Calendar,
    children: [
      { label: "Upcoming", href: "/gradient/events", icon: Calendar },
      { label: "Past", href: "/gradient/past-events", icon: History },
    ],
  },
  { label: "Blog", href: "/gradient/blog", icon: FileText },
  { label: "Resources", href: "/gradient/resources", icon: Library },
  {
    label: "Recordings",
    href: "/gradient/recordings",
    icon: Video,
    children: [
      // `exact` matters: /recordings/categories sits *inside* /recordings, so
      // without it the prefix match lights both rows at once — the same trap
      // /leads/meta documents below.
      { label: "All Recordings", href: "/gradient/recordings", icon: Video, exact: true },
      { label: "Categories", href: "/gradient/recordings/categories", icon: Tags },
    ],
  },
  {
    label: "Projects",
    href: "/gradient/projects",
    icon: FolderGit2,
    children: [
      // `exact` for the same reason as Recordings: /projects/categories sits
      // inside /projects, so a prefix match would light both rows at once.
      { label: "All Projects", href: "/gradient/projects", icon: FolderGit2, exact: true },
      { label: "Submissions", href: "/gradient/projects/submissions", icon: Inbox },
      { label: "Categories", href: "/gradient/projects/categories", icon: Tags },
      { label: "Download Email", href: "/gradient/projects/email-templates", icon: Mail },
    ],
  },
  { label: "Jobs", href: "/gradient/jobs", icon: Briefcase },
  {
    label: "Leads",
    href: "/gradient/leads",
    icon: Target,
    children: [
      // Website and Facebook leads are separate tables with separate screens
      // — a website lead is asked which page and UTM, a Meta lead which form,
      // campaign and creative. One list answering both badly helps nobody.
      { label: "Website Leads", href: "/gradient/leads", icon: Target, exact: true },
      { label: "Meta Leads", href: "/gradient/leads/meta", icon: Facebook },
    ],
  },
  { label: "Subscribers", href: "/gradient/subscribers", icon: Mail },
  {
    label: "Marketing",
    href: "/gradient/marketing",
    icon: Megaphone,
    children: [
      { label: "Campaigns", href: "/gradient/marketing/campaigns", icon: Send },
      { label: "Automations", href: "/gradient/marketing/automations", icon: Workflow },
      { label: "Contacts", href: "/gradient/marketing/contacts", icon: Users },
    ],
  },
  {
    label: "Integrations",
    href: "/gradient/integrations",
    icon: Plug,
    // Open to every admin. Operating the integration — mapping forms, running
    // backfills, watching the poll — is lead work; only pasting a page token,
    // deleting an account and the global ingestion switch need Super Admin, and
    // those are gated per action inside the page and by requireRole server-side.
    children: [
      {
        label: "Facebook",
        href: "/gradient/integrations/facebook",
        icon: Facebook,
      },
    ],
  },
  { label: "Staff", href: "/gradient/users", icon: Users, role: "Super Admin" },
  // Hiding the link is convenience only — /activity-logs is enforced server-side
  // by requireRole, unlike most routes in this panel.
  { label: "Activity Log", href: "/gradient/activity", icon: History, role: "Super Admin" },
];

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const { admin, logout } = useAuth();
  const pathname = usePathname();

  // A child route keeps its parent highlighted: /marketing/campaigns/<id> is
  // still Campaigns, and an exact match would leave nothing lit while editing.
  const isUnder = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  // Groups start open when you are inside them, and can be collapsed by hand.
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  return (
    <aside className="w-60 h-screen border-r bg-background flex flex-col">
      {/* Logo */}
      <div className="flex items-center justify-between px-4 py-[13.5px] border-b">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[9px] bg-[#3296f7] text-primary-foreground grid place-items-center font-bold">
            <img src="/gradient-logo.png" alt="Gradient Logo" />
          </div>
          <span className="font-semibold">Gradient Learnings</span>
        </div>
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-8 w-8"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="px-2 pt-2">
        <WorkspaceSwitcherCompact />
      </div>

      {/* Navigation */}
      {/*
        `min-h-0` is load-bearing, not tidying. A flex item defaults to
        `min-height: auto`, which means it refuses to shrink below its content —
        so without this the nav grows to the full height of the item list, the
        viewport never overflows, no scrollbar appears, and the account footer
        below is pushed off the bottom of the screen.
      */}
      <ScrollArea className="min-h-0 flex-1 px-2 py-2">
        <div className="space-y-1">
          {navItems.map((item) => {
            if (item.role && admin?.role?.name !== item.role) return null;

            if (item.children) {
              // Children are not always nested under the parent's href —
              // /past-events sits beside /events, not inside it.
              const inside =
                isUnder(item.href) ||
                item.children.some((child) => isUnder(child.href, child.exact));
              const open = collapsed[item.href] ?? inside;

              return (
                <div key={item.href}>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-3"
                    aria-expanded={open}
                    onClick={() =>
                      setCollapsed((prev) => ({
                        ...prev,
                        [item.href]: !open,
                      }))
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="flex-1 text-left text-[14px]">
                      {item.label}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform ${
                        open ? "" : "-rotate-90"
                      }`}
                    />
                  </Button>

                  {open && (
                    <div className="mt-1 ml-4 space-y-1 border-l pl-2">
                      {item.children
                        .filter(
                          // The same rule the top level applies. Without it a
                          // Super-Admin-only child is visible to everybody.
                          (child) =>
                            !child.role || admin?.role?.name === child.role,
                        )
                        .map((child) => (
                        <Button
                          key={child.href}
                          asChild
                          variant={
                            isUnder(child.href, child.exact)
                              ? "secondary"
                              : "ghost"
                          }
                          className="w-full justify-start gap-3"
                        >
                          <Link
                            href={child.href}
                            onClick={() => onClose && onClose()}
                          >
                            <child.icon className="h-4 w-4" />
                            <span className="flex-1 text-left text-[14px]">
                              {child.label}
                            </span>
                          </Link>
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            const active = pathname === item.href;

            return (
              <Button
                key={item.href}
                asChild
                variant={active ? "secondary" : "ghost"}
                className="w-full justify-start gap-3"
              >
                <Link href={item.href} onClick={() => onClose && onClose()}>
                  <item.icon className="h-4 w-4" />
                  <span className="flex-1 text-left text-[14px]">
                    {item.label}
                  </span>
                </Link>
              </Button>
            );
          })}
        </div>
      </ScrollArea>

      {/* Bottom */}
      <div className="border-t p-2 space-y-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 mt-2 h-auto py-2"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback>{admin?.name?.charAt(0)}</AvatarFallback>
              </Avatar>

              <div className="text-left text-sm leading-tight">
                <p className="font-medium">{admin?.name}</p>
                <p className="text-[11px] text-muted-foreground">
                  {admin?.role?.name}
                </p>
              </div>
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent side="top" align="start" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="font-medium">{admin?.name}</span>
                <span className="text-xs text-muted-foreground">
                  {admin?.email}
                </span>
              </div>
            </DropdownMenuLabel>

            <DropdownMenuSeparator />

            <DropdownMenuItem onClick={logout}>Logout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </aside>
  );
}
