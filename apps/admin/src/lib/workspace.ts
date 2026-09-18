import Cookies from "js-cookie";

/**
 * The three workspaces unified-admin toggles between. See
 * tps-monorepo/BACKEND-CONSOLIDATION-PLAN.md §7 for the design this
 * implements: one login (against the CRM backend, which owns the shared
 * `users` + `admin_workspace_grants` tables), one JWT carrying a
 * `workspaces: [{ workspace, role }]` claim, and a switcher here that only
 * ever shows a workspace the signed-in admin actually has a grant for.
 */
export type WorkspaceId = "gradient" | "tps" | "crm";

export interface WorkspaceDef {
  id: WorkspaceId;
  label: string;
  homePath: string;
  /** env var holding this workspace's backend base URL */
  apiBaseUrlEnv: string;
}

export const WORKSPACES: Record<WorkspaceId, WorkspaceDef> = {
  gradient: {
    id: "gradient",
    label: "Gradient",
    homePath: "/gradient/dashboard",
    apiBaseUrlEnv: "NEXT_PUBLIC_API_URL_GRADIENT",
  },
  tps: {
    id: "tps",
    label: "The Product Space",
    homePath: "/tps/dashboard",
    apiBaseUrlEnv: "NEXT_PUBLIC_API_URL_TPS",
  },
  crm: {
    id: "crm",
    label: "CRM",
    homePath: "/crm/dashboard",
    apiBaseUrlEnv: "NEXT_PUBLIC_API_URL_CRM",
  },
};

const ACTIVE_WORKSPACE_COOKIE = "active_workspace";

export interface WorkspaceGrant {
  workspace: WorkspaceId;
  role: string;
}

/** Reads the workspace grants the JWT carried, stashed at login (see AuthContext). */
export const getWorkspaceGrants = (): WorkspaceGrant[] => {
  try {
    const raw = Cookies.get("workspaces");
    return raw ? (JSON.parse(raw) as WorkspaceGrant[]) : [];
  } catch {
    return [];
  }
};

export const getActiveWorkspace = (): WorkspaceId | null => {
  const grants = getWorkspaceGrants();
  const stored = Cookies.get(ACTIVE_WORKSPACE_COOKIE) as WorkspaceId | undefined;
  if (stored && grants.some((g) => g.workspace === stored)) return stored;
  return grants[0]?.workspace ?? null;
};

export const setActiveWorkspace = (workspace: WorkspaceId) => {
  Cookies.set(ACTIVE_WORKSPACE_COOKIE, workspace, { expires: 7, secure: true });
};

/** This workspace's role for the signed-in admin, or null if they have no grant for it. */
export const getRoleInWorkspace = (workspace: WorkspaceId): string | null => {
  return getWorkspaceGrants().find((g) => g.workspace === workspace)?.role ?? null;
};

// NEXT_PUBLIC_* vars are inlined at build time by literal reference only —
// Next.js's webpack config does not inline `process.env[dynamicKey]` — so
// each one has to be referenced explicitly here rather than looked up via
// WORKSPACES[workspace].apiBaseUrlEnv.
const API_BASE_URLS: Record<WorkspaceId, string> = {
  gradient: process.env.NEXT_PUBLIC_API_URL_GRADIENT as string,
  tps: process.env.NEXT_PUBLIC_API_URL_TPS as string,
  crm: process.env.NEXT_PUBLIC_API_URL_CRM as string,
};

/** The CRM is always the identity backend — login/refresh/me always target it,
 * regardless of which workspace is currently active. */
export const CRM_API_BASE_URL = API_BASE_URLS.crm;

export const getWorkspaceApiBaseUrl = (workspace: WorkspaceId): string => {
  return API_BASE_URLS[workspace];
};
