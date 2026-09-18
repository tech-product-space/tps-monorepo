"use client";

import { useEffect, useState } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { HoverLoading } from "@/components/Common/Loading/HoverLoading";
import { getAllReferrals } from "@/services/referral/referralServices";
import { ReferralTable } from "./ReferralTable/ReferralTable";
import { useNotification } from "@/helpers/NotificationContext";

export interface ReferralSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  usedReferralId: string | null;
  type: string;
  createdAt: string;
  updatedAt: string;
  referrer?: {
    id: string;
    name: string;
    email: string | null;
    referralCode: string;
  } | null;
}

export const Referrals = () => {
  const { showNotification } = useNotification();
  const [referrals, setReferrals] = useState<ReferralSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const getAllReferralsFn = async () => {
    try {
      const data = await getAllReferrals();
      setReferrals(data.members);
    } catch {
      showNotification("error", "Error", "Failed to fetch referrals");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    getAllReferralsFn();
  }, []);

  return (
    <div className="flex flex-col h-screen">
      <div className="px-5 h-16 flex justify-between items-center border-b">
        <div className="flex items-center gap-2">
          <SidebarTrigger size={"lg"} />
          <p className="text-lg font-semibold">Referrals</p>
        </div>
      </div>

      {isLoading ? (
        <HoverLoading title="Please wait while we fetch referrals..." />
      ) : (
        <div className="flex flex-col h-full overflow-auto">
          <ReferralTable referrals={referrals} />
        </div>
      )}
    </div>
  );
};
