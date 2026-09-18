"use client";

import { useEffect, useState } from "react";
import { HoverLoading } from "@/components/Common/Loading/HoverLoading";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { ReferralTable } from "./ReferralTable/ReferralTable";
import { useNotification } from "@/helpers/NotificationContext";
import { usePathname } from "next/navigation";
import {
  getEventReferals,
  getEventReferalsDetails,
} from "@/services/Events/eventServices";
import {
  eventGuestStatus,
  sendEmailNotification,
} from "@/services/Events/eventServices";
import { IGuest } from "../../Events/ManageEvents/ManageEvents";

export interface ReferralSummary {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  referralCode: string;
  memberCount: number;
  guestType: "Approved" | "Declined" | "Waitlist";
}

export interface ReferredMember {
  id: string;
  name: string;
  email: string;
  phone: string;
}

export interface ReferralWithMembers {
  referralId: string;
  referralCode: string;
  referredMembers: ReferredMember[];
}

interface EventReferralsProps {
  eventId: number;
  getApprovalStatusBadge: (status: IGuest["guestType"]) => React.ReactNode;
}

export const EventReferrals = ({
  eventId,
  getApprovalStatusBadge,
}: EventReferralsProps) => {
  const [referrals, setReferrals] = useState<ReferralSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [open, setOpen] = useState(false);
  const [selectedUsers, setSelectedUsers] =
    useState<ReferralWithMembers | null>(null);

  // Bulk accept dialog state
  const [bulkAcceptOpen, setBulkAcceptOpen] = useState(false);
  const [minMemberCount, setMinMemberCount] = useState<number>(1);
  const [isBulkAccepting, setIsBulkAccepting] = useState(false);

  const { showNotification } = useNotification();
  const pathname = usePathname().split("/").pop();

  const getAllReferralsFn = async () => {
    try {
      const data = await getEventReferals(pathname);
      const mapped: ReferralSummary[] = data.data.map((item: any) => ({
        id: item.id,
        name: item.name,
        email: item.email || null,
        phone: item.phone || null,
        referralCode: item.referralCode,
        memberCount: item.memberCount,
        guestType: item.referrerDetail?.guestType ?? "Waitlist",
      }));
      setReferrals(mapped);
    } catch {
      showNotification("error", "Error", "Failed to fetch referrals");
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewUsers = async (referralCode: string) => {
    try {
      const data = await getEventReferalsDetails(pathname, referralCode);
      setSelectedUsers(data);
      setOpen(true);
    } catch {
      showNotification("error", "Error", "Failed to fetch referred users");
    }
  };

  const handleAcceptGuest = async (guestId: number) => {
    try {
      await eventGuestStatus({
        userIds: [guestId],
        eventId,
        status: "Approved",
      });

      await sendEmailNotification({
        type: "Approved",
        userIds: [guestId],
        eventId,
      });

      showNotification(
        "success",
        "Action Successful",
        "Guest has been approved successfully",
      );

      setReferrals((prev) =>
        prev.map((r) =>
          r.id === guestId ? { ...r, guestType: "Approved" } : r,
        ),
      );
    } catch (error) {
      console.error("Error approving guest:", error);
      showNotification("error", "Error", "Failed to approve guest");
    }
  };

  const handleDeclineGuest = async (guestId: number) => {
    try {
      await eventGuestStatus({
        userIds: [guestId],
        eventId,
        status: "Declined",
      });

      await sendEmailNotification({
        type: "Declined",
        userIds: [guestId],
        eventId,
      });

      showNotification(
        "success",
        "Action Successful",
        "Guest has been declined",
      );

      setReferrals((prev) =>
        prev.map((r) =>
          r.id === guestId ? { ...r, guestType: "Declined" } : r,
        ),
      );
    } catch (error) {
      console.error("Error declining guest:", error);
      showNotification("error", "Error", "Failed to decline guest");
    }
  };

  const handleBulkAcceptByMemberCount = async () => {
    const userIds = referrals
      .filter(
        (r) => r.guestType === "Waitlist" && r.memberCount >= minMemberCount,
      )
      .map((r) => r.id);

    if (userIds.length === 0) {
      showNotification(
        "error",
        "No Guests Found",
        `No waitlisted guests with ${minMemberCount}+ referred member(s) found`,
      );
      return;
    }

    setIsBulkAccepting(true);
    try {
      await eventGuestStatus({
        userIds,
        eventId,
        status: "Approved",
      });

      await sendEmailNotification({
        type: "Approved",
        userIds,
        eventId,
      });

      showNotification(
        "success",
        "Action Successful",
        `${userIds.length} guest(s) approved successfully`,
      );

      setReferrals((prev) =>
        prev.map((r) =>
          userIds.includes(r.id) ? { ...r, guestType: "Approved" as const } : r,
        ),
      );

      setBulkAcceptOpen(false);
    } catch (error: any) {
      console.error("Error bulk approving guests:", error);
      showNotification(
        "error",
        "Action Failed",
        error?.message || "Failed to bulk approve guests",
      );
    } finally {
      setIsBulkAccepting(false);
    }
  };

  const affectedCount = referrals.filter(
    (r) => r.guestType === "Waitlist" && r.memberCount >= minMemberCount,
  ).length;

  useEffect(() => {
    getAllReferralsFn();
  }, []);

  return (
    <div className="flex flex-col h-auto overflow-y-auto">
      {isLoading ? (
        <HoverLoading title="Please wait while we fetch referrals..." />
      ) : (
        <div className="flex flex-col h-full gap-3 ">
          {/* Bulk Accept trigger */}
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => {
                setMinMemberCount(1);
                setBulkAcceptOpen(true);
              }}
            >
              Bulk Accept by Member Count
            </Button>
          </div>

          <ReferralTable
            referrals={referrals}
            onViewReferredUsers={handleViewUsers}
            onAccept={handleAcceptGuest}
            onDecline={handleDeclineGuest}
            getApprovalStatusBadge={getApprovalStatusBadge}
          />
        </div>
      )}

      {/* Referred Users Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="min-w-xl">
          <DialogHeader>
            <DialogTitle>Users Referred</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 overflow-y-auto max-h-[75vh]">
            {!selectedUsers || selectedUsers.referredMembers.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                No referred users yet.
              </p>
            ) : (
              <ul className="divide-y border rounded-md">
                {selectedUsers.referredMembers.map((user) => (
                  <li
                    key={user.id}
                    className="flex justify-between items-center px-4 py-2"
                  >
                    <div>
                      <p className="font-medium">{user.name}</p>
                      <p className="text-sm text-muted-foreground">
                        {user.email}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {user.phone}
                      </p>
                    </div>
                    <span className="text-xs bg-muted px-2 py-1 rounded-md">
                      {selectedUsers.referralCode}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Bulk Accept by Member Count Dialog */}
      <Dialog open={bulkAcceptOpen} onOpenChange={setBulkAcceptOpen}>
        <DialogContent className="min-w-[30vw]">
          <DialogHeader>
            <DialogTitle>Bulk Accept by Member Count</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <Label htmlFor="minMemberCount">
                Minimum referred members (≥)
              </Label>
              <Input
                id="minMemberCount"
                type="number"
                min={1}
                value={minMemberCount}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  setMinMemberCount(isNaN(val) || val < 1 ? 1 : val);
                }}
              />
            </div>

            {/* Live preview of affected guests */}
            <p className="text-sm text-muted-foreground">
              {affectedCount > 0 ? (
                <>
                  This will approve{" "}
                  <span className="font-medium text-foreground">
                    {affectedCount} waitlisted guest
                    {affectedCount !== 1 ? "s" : ""}
                  </span>
                  .
                </>
              ) : (
                <>No waitlisted guests match this criteria.</>
              )}
            </p>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setBulkAcceptOpen(false)}
                disabled={isBulkAccepting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleBulkAcceptByMemberCount}
                disabled={affectedCount === 0 || isBulkAccepting}
              >
                {isBulkAccepting
                  ? "Approving..."
                  : `Approve ${affectedCount} Guest${affectedCount !== 1 ? "s" : ""}`}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
