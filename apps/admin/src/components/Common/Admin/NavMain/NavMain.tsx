"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";

export function NavMain({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon: LucideIcon;
    isActive?: boolean;
    items?: {
      title: string;
      url: string;
    }[];
  }[];
}) {
  const pathname = usePathname() ?? "/";

  // Normalize paths (remove trailing slashes, lowercase)
  const normalize = (p?: string) => (p ?? "").toLowerCase().replace(/\/+$/, "");

  const currentPath = normalize(pathname);

  // Matches base and sub-routes
  const matchPath = (base?: string, current = currentPath) => {
    if (!base) return false;
    const nb = normalize(base);
    if (!nb) return false;
    return current === nb || current.startsWith(nb + "/");
  };

  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map((item) => {
          const itemIsActive = matchPath(item.url);
          const childActive = item.items?.some((si) => matchPath(si.url)) ?? false;
          const open = itemIsActive || childActive || !!item.isActive;
          const activeClass = "bg-slate-100 text-black";

          return (
            <Collapsible key={item.title} asChild defaultOpen={open}>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  className={`px-3 py-2 rounded-md ${
                    itemIsActive ? activeClass : "hover:bg-gray-100"
                  }`}
                >
                  <Link href={item.url} className="flex items-center gap-2">
                    <item.icon size={18} />
                    <span>{item.title}</span>
                  </Link>
                </SidebarMenuButton>

                {item.items?.length ? (
                  <>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuAction className="transition-transform data-[state=open]:rotate-90">
                        <ChevronRight size={18} />
                        <span className="sr-only">Toggle</span>
                      </SidebarMenuAction>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {item.items.map((subItem) => {
                          const subActive = matchPath(subItem.url);
                          return (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton asChild>
                                <Link
                                  href={subItem.url}
                                  className={`block w-full px-3 py-2 rounded-md ${
                                    subActive ? activeClass : ""
                                  }`}
                                  aria-current={subActive ? "page" : undefined}
                                >
                                  <span>{subItem.title}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </>
                ) : null}
              </SidebarMenuItem>
            </Collapsible>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}
