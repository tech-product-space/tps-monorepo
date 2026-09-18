"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Check, X } from "lucide-react";
import { ReferralSummary } from "../Referrals";
import { IGuest } from "../../../Events/ManageEvents/ManageEvents";

interface ReferralTableProps {
  referrals: ReferralSummary[];
  onViewReferredUsers: (referralCode: string) => void;
  onAccept: (guestId: number) => void;
  onDecline: (guestId: number) => void;
  getApprovalStatusBadge: (status: IGuest["guestType"]) => React.ReactNode;
}

const statusVariant = (
  guestType: string,
): "default" | "secondary" | "destructive" | "outline" => {
  switch (guestType) {
    case "Approved":
      return "default";
    case "Declined":
      return "destructive";
    case "Waitlist":
      return "secondary";
    default:
      return "outline";
  }
};

export const ReferralTable = ({
  referrals,
  onViewReferredUsers,
  onAccept,
  onDecline,
  getApprovalStatusBadge,
}: ReferralTableProps) => {
  return (
    <div className="rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Referral Code</TableHead>
            <TableHead>Members</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {referrals.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-center py-8 text-muted-foreground"
              >
                No referrals found
              </TableCell>
            </TableRow>
          ) : (
            referrals.map((referral) => {
              const isSettled =
                referral.guestType === "Approved" ||
                referral.guestType === "Declined";

              return (
                <TableRow key={referral.id}>
                  <TableCell className="font-medium">{referral.name}</TableCell>
                  <TableCell>{referral.email || "N/A"}</TableCell>
                  <TableCell>
                    <code className="bg-muted px-2 py-1 rounded text-sm">
                      {referral.referralCode}
                    </code>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{referral.memberCount}</Badge>
                  </TableCell>
                  <TableCell>
                    <div >
                      {getApprovalStatusBadge(referral.guestType)}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end items-center gap-1">
                      {!isSettled && (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50 border rounded-md"
                            onClick={() => onAccept(referral.id)}
                            title="Approve"
                          >
                            <Check className="h-4 w-4" />
                            <span className="sr-only">Approve</span>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 border rounded-md"
                            onClick={() => onDecline(referral.id)}
                            title="Decline"
                          >
                            <X className="h-4 w-4" />
                            <span className="sr-only">Decline</span>
                          </Button>
                        </>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() =>
                          onViewReferredUsers(referral.referralCode)
                        }
                        title="View referred members"
                      >
                        <Eye className="h-4 w-4" />
                        <span className="sr-only">View Members</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
};
