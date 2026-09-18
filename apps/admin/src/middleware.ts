import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type WorkspaceId = "gradient" | "tps" | "crm";
interface WorkspaceGrant {
  workspace: WorkspaceId;
  role: string;
}

const HOME_PATH: Record<WorkspaceId, string> = {
  gradient: "/gradient/dashboard",
  tps: "/tps/dashboard",
  crm: "/crm/dashboard",
};

const workspaceForPath = (path: string): WorkspaceId | null => {
  if (path.startsWith("/gradient")) return "gradient";
  if (path.startsWith("/tps")) return "tps";
  if (path.startsWith("/crm")) return "crm";
  return null;
};

const parseGrants = (raw: string | undefined): WorkspaceGrant[] => {
  if (!raw) return [];
  try {
    return JSON.parse(decodeURIComponent(raw));
  } catch {
    return [];
  }
};

/**
 * Gates the three workspace trees (/gradient, /tps, /crm) by whether the
 * signed-in admin actually holds a grant for that workspace — see
 * lib/workspace.ts and BACKEND-CONSOLIDATION-PLAN.md §7.2/§7.3. Replaces the
 * old single-`currentRole` gate, which only ever knew about one product.
 */
export function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  const authToken = request.cookies.get("admin_token")?.value;
  const grants = parseGrants(request.cookies.get("workspaces")?.value);

  const isAuthPage = path.startsWith("/auth");
  const requestedWorkspace = workspaceForPath(path);

  const clearSessionAndRedirectToLogin = () => {
    const response = NextResponse.redirect(new URL("/auth/login", request.url));
    response.cookies.delete("admin_token");
    response.cookies.delete("admin_refreshToken");
    response.cookies.delete("workspaces");
    response.cookies.delete("active_workspace");
    return response;
  };

  if (authToken && grants.length > 0 && isAuthPage) {
    return NextResponse.redirect(new URL(HOME_PATH[grants[0].workspace], request.url));
  }

  if (!authToken || grants.length === 0) {
    if (!isAuthPage) return clearSessionAndRedirectToLogin();
    return NextResponse.next();
  }

  // Gate each workspace tree on an actual grant for it, not just "logged in
  // somewhere" — an admin with only a `crm` grant must not reach /tps or
  // /gradient even with a valid token.
  if (requestedWorkspace && !grants.some((g) => g.workspace === requestedWorkspace)) {
    return NextResponse.redirect(new URL(HOME_PATH[grants[0].workspace], request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/auth/:path*", "/gradient/:path*", "/tps/:path*", "/crm/:path*"],
};
