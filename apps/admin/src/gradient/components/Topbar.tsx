"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator,
  BreadcrumbPage,
} from "@/gradient/components/ui/breadcrumb";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/gradient/components/ui/button";

export default function Topbar({
  title = "Overview",
  actions,
  onMenuClick,
  isSidebarOpen = true,
}: {
  // A node, not just a string: a detail page's title can carry a status badge
  // or an inline rename field beside the name.
  title?: React.ReactNode;
  actions?: React.ReactNode;
  onMenuClick?: () => void;
  isSidebarOpen?: boolean;
}) {
  return (
    <header className="h-15 border-b bg-white flex items-center justify-between px-6 sticky top-0 z-40 backdrop-blur overflow-visible">
      {/* Left */}
      <div className="flex items-center gap-3">
        {/* Always the sidebar toggle. This used to turn into a back button on
            any nested route, which meant a detail page supplying its own back
            control ended up with two of them side by side — and the sidebar
            became untoggleable on exactly the pages with the least room. */}
        {onMenuClick && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="shrink-0"
            aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
          >
            {isSidebarOpen ? (
              <PanelLeftClose className="h-5 w-5" />
            ) : (
              <PanelLeftOpen className="h-5 w-5" />
            )}
          </Button>
        )}
        <div className="flex min-w-0 flex-col">
          <h1 className="flex min-w-0 items-center gap-3 text-lg leading-none font-semibold">
            {title}
          </h1>

          {/* <Breadcrumb className="text-xs mt-1">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Home</BreadcrumbLink>
              </BreadcrumbItem>

              <BreadcrumbSeparator />

              <BreadcrumbItem>
                <BreadcrumbPage>{title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb> */}
        </div>
      </div>

      {/* Right */}
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}
