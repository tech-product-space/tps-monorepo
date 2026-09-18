"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Cookies from "js-cookie";
import Loading from "./loading";
import { WORKSPACES, getWorkspaceGrants, setActiveWorkspace } from "@/lib/workspace";

// Old admin/superadmin/creator route trees were collapsed into one role-gated
// `/tps` workspace (see BACKEND-CONSOLIDATION-PLAN.md §7.3 and §9's flagged
// duplication) — this now routes by *workspace grant*, not by a role string
// that used to encode both "which product" and "how much access within it".
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = Cookies.get("admin_token");
    const grants = getWorkspaceGrants();

    if (token && grants.length > 0) {
      const first = grants[0];
      setActiveWorkspace(first.workspace);
      window.location.href = WORKSPACES[first.workspace].homePath;
    } else {
      Cookies.remove("admin_token");
      Cookies.remove("workspaces");
      router.push("/auth/login");
    }
  }, []);

  return <Loading />;
}
