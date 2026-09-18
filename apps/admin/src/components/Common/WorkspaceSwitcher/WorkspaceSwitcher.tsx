"use client";

import * as React from "react";
import { ChevronsUpDown, Check, Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import {
  WORKSPACES,
  WorkspaceId,
  getWorkspaceGrants,
  getActiveWorkspace,
  setActiveWorkspace,
} from "@/lib/workspace";

/**
 * One login, one permission system, three toggleable workspaces — the piece
 * that makes "one admin" real rather than three apps glued together. Only
 * ever lists workspaces the signed-in admin holds a grant for (see
 * middleware.ts and BACKEND-CONSOLIDATION-PLAN.md §7.2); switching sets the
 * `active_workspace` cookie PrivateAxios reads to route API calls, then
 * navigates to that workspace's dashboard.
 */
export function WorkspaceSwitcher() {
  const router = useRouter();
  const [grants, setGrants] = React.useState(getWorkspaceGrants());
  const [active, setActive] = React.useState<WorkspaceId | null>(getActiveWorkspace());

  React.useEffect(() => {
    setGrants(getWorkspaceGrants());
    setActive(getActiveWorkspace());
  }, []);

  if (grants.length <= 1) return null; // nothing to switch between

  const activeDef = active ? WORKSPACES[active] : null;

  const handleSwitch = (workspace: WorkspaceId) => {
    setActiveWorkspace(workspace);
    setActive(workspace);
    router.push(WORKSPACES[workspace].homePath);
  };

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <Building2 className="size-4" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {activeDef?.label ?? "Select workspace"}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {active ? grants.find((g) => g.workspace === active)?.role : ""}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="start" side="right">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Workspaces
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {grants.map((g) => (
              <DropdownMenuItem
                key={g.workspace}
                onClick={() => handleSwitch(g.workspace)}
                className="gap-2"
              >
                <div className="flex flex-1 flex-col">
                  <span>{WORKSPACES[g.workspace].label}</span>
                  <span className="text-xs text-muted-foreground">{g.role}</span>
                </div>
                {g.workspace === active && <Check className="size-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
