"use client";

/**
 * Same switcher as WorkspaceSwitcher.tsx, built without the shadcn Sidebar
 * primitives — for sidebars that don't use that design system (gradient's
 * Sidebar.tsx is a bespoke `<aside>` layout, not built on @/components/ui/sidebar).
 * Both read the same `getWorkspaceGrants`/`setActiveWorkspace` state.
 */
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
import { Button } from "@/gradient/components/ui/button";
import {
  WORKSPACES,
  WorkspaceId,
  getWorkspaceGrants,
  getActiveWorkspace,
  setActiveWorkspace,
} from "@/lib/workspace";

export function WorkspaceSwitcherCompact() {
  const router = useRouter();
  const [grants, setGrants] = React.useState(getWorkspaceGrants());
  const [active, setActive] = React.useState<WorkspaceId | null>(getActiveWorkspace());

  React.useEffect(() => {
    setGrants(getWorkspaceGrants());
    setActive(getActiveWorkspace());
  }, []);

  if (grants.length <= 1) return null;

  const handleSwitch = (workspace: WorkspaceId) => {
    setActiveWorkspace(workspace);
    setActive(workspace);
    router.push(WORKSPACES[workspace].homePath);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between gap-2">
          <span className="flex items-center gap-2 truncate">
            <Building2 className="h-4 w-4 shrink-0" />
            {active ? WORKSPACES[active].label : "Select workspace"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="start">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          Workspaces
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {grants.map((g) => (
          <DropdownMenuItem key={g.workspace} onClick={() => handleSwitch(g.workspace)} className="gap-2">
            <div className="flex flex-1 flex-col">
              <span>{WORKSPACES[g.workspace].label}</span>
              <span className="text-xs text-muted-foreground">{g.role}</span>
            </div>
            {g.workspace === active && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
