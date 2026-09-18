"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/gradient/lib/utils";

export interface TabItem<T extends string = string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  badge?: string | number;
  disabled?: boolean;
}

interface TabSwitcherProps<T extends string> {
  tabs: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}

export function TabSwitcher<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: TabSwitcherProps<T>) {
  return (
    <div
      role="tablist"
      aria-label="Blog editor sections"
      className={cn(
        "flex w-full gap-1 rounded-lg border bg-muted/50 p-1",
        className,
      )}
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = tab.value === value;

        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            disabled={tab.disabled}
            onClick={() => onChange(tab.value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:pointer-events-none disabled:opacity-50",
              isActive
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-white/60 hover:text-foreground",
            )}
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" />}
            <span className="truncate">{tab.label}</span>
            {tab.badge !== undefined && tab.badge !== "" && (
              <span
                className={cn(
                  "ml-0.5 rounded-full px-1.5 py-0.5 text-[11px] leading-none font-semibold",
                  isActive
                    ? "bg-muted text-foreground"
                    : "bg-muted-foreground/15 text-muted-foreground",
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
