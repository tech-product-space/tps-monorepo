"use client";

/**
 * Compatibility shim over the unified AuthContext (@/helpers/AuthContext).
 *
 * gradient-admin's ~12 components call `useAuth()` expecting `{ admin, loading,
 * logout }` (and one dead login form expects `login`) from its own
 * localStorage-based AuthContext. Rather than editing every call site, this
 * wraps the shared, cookie-based AuthProvider (mounted once at app/layout.tsx
 * — see BACKEND-CONSOLIDATION-PLAN.md §7.2) and translates field names, so
 * gradient's pages read the same single signed-in session as tps/crm do
 * instead of a separate local one.
 */
import { createContext, useContext, ReactNode } from "react";
import { useAuth as useUnifiedAuth } from "@/helpers/AuthContext";
import { getRoleInWorkspace } from "@/lib/workspace";
import { Admin } from "@/gradient/types/admin";

type GradientAuthContextType = {
  admin: Admin | null;
  loading: boolean;
  login: (token: string, admin: Admin) => void;
  logout: () => void;
};

const GradientAuthContext = createContext<GradientAuthContextType>({
  admin: null,
  loading: true,
  login: () => {},
  logout: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  // No-op: the real provider is mounted once at the app root. This exists
  // only so gradient pages that still wrap themselves in
  // `<AuthProvider>` (leftover from gradient-admin) don't break.
  return <>{children}</>;
}

export function useAuth(): GradientAuthContextType {
  const { user, isLoading, logout } = useUnifiedAuth();

  // `user.role` off the shared session is the admin's CRM-scoped role — for
  // Gradient's own role gating (`item.role` checks in Sidebar.tsx) we need
  // their *gradient* workspace grant instead, which can be a different role
  // entirely (e.g. CRM "Manager" + Gradient "Super Admin" on the same person).
  const gradientRole = getRoleInWorkspace("gradient");

  const admin: Admin | null = user
    ? {
        id: user.id || "",
        name: user.name,
        email: user.email,
        isActive: true,
        inviteStatus: "accepted",
        role: gradientRole ? { id: "", name: gradientRole } : undefined,
      }
    : null;

  return {
    admin,
    loading: isLoading,
    logout,
    // Dead in this app (gradient's own login page/route was dropped in
    // favor of the unified /auth/login) — kept only so LoginForm.tsx,
    // which is no longer routed to, still compiles.
    login: () => {},
  };
}

export { GradientAuthContext };
