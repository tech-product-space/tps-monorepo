"use client";

import { usePathname } from "next/navigation";

// Returns the role-prefix segment for the current automation URL so workflow
// pages can render under either /admin/automation/* or /superadmin/automation/*
// without hardcoding the role. Falls back to /admin for any unexpected path.
export function useAutomationBasePath(): "/admin" | "/superadmin" {
  const pathname = usePathname();
  if (pathname?.startsWith("/superadmin")) return "/superadmin";
  return "/admin";
}
