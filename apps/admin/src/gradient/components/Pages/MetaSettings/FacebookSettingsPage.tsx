"use client";

import { useCallback, useEffect, useState } from "react";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { Activity, Facebook, Loader2, SlidersHorizontal } from "lucide-react";

import { TabSwitcher, type TabItem } from "@/gradient/components/ui/custom/TabSwitcher";
import { useAuth } from "@/gradient/context/AuthContext";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { metaService } from "@/gradient/services/metaService";
import type { MetaAccount } from "@/gradient/types/meta";

import AccountsTab from "./components/AccountsTab";
import FormsTab from "./components/FormsTab";
import MonitoringTab from "./components/MonitoringTab";

type Tab = "accounts" | "forms" | "monitoring";

const TABS: readonly TabItem<Tab>[] = [
  { value: "accounts", label: "Accounts", icon: Facebook },
  { value: "forms", label: "Forms & Mapping", icon: SlidersHorizontal },
  { value: "monitoring", label: "Monitoring", icon: Activity },
];

/**
 * Facebook lead ingestion. Open to any admin; a few actions are not.
 *
 * This deliberately does *not* follow the /users and /activity pattern of
 * redirecting non-Super-Admins away. Running the integration — mapping forms,
 * backfilling, checking the poll — is lead work, and the people who do it are
 * not Super Admins. What they cannot do is paste a page token, delete an
 * account, or flip the global ingestion switch, so `canManage` is threaded down
 * to the tabs rather than gating the whole screen.
 *
 * Hiding those controls is convenience only. `requireRole` enforces them
 * server-side, and it reads the role from the JWT while AuthContext reads it
 * from /auth/me — so a freshly promoted admin passes the check here and still
 * 403s until they log in again. Hence the 403 branch below as a backstop.
 */
const FacebookSettingsPage = () => {
  const { admin, loading: authLoading } = useAuth();

  const [tab, setTab] = useState<Tab>("accounts");
  const [accounts, setAccounts] = useState<MetaAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const isSuperAdmin = admin?.role?.name === "Super Admin";

  const fetchAccounts = useCallback(async () => {
    if (authLoading || !admin) return;

    try {
      const res = await metaService.listAccounts();
      setAccounts(res.data || []);
    } catch (error) {
      const forbidden = isAxiosError(error) && error.response?.status === 403;

      toast.error(
        forbidden
          ? "You do not have access to the Facebook integration"
          : getApiErrorMessage(error, "Could not load Facebook accounts"),
      );
    } finally {
      setLoading(false);
    }
  }, [authLoading, admin]);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  if (authLoading || !admin) return null;

  return (
    <div className="space-y-4">
      <TabSwitcher tabs={TABS} value={tab} onChange={setTab} />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {tab === "accounts" && (
            <AccountsTab
              accounts={accounts}
              loading={loading}
              canManage={isSuperAdmin}
              onRefresh={fetchAccounts}
            />
          )}
          {tab === "forms" && <FormsTab accounts={accounts} />}
          {tab === "monitoring" && (
            <MonitoringTab accounts={accounts} canManage={isSuperAdmin} />
          )}
        </>
      )}
    </div>
  );
};

export default FacebookSettingsPage;
