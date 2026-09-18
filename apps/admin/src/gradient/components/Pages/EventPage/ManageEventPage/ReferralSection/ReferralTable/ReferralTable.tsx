"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import { Badge } from "@/gradient/components/ui/badge";
import { Check, Eye, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { eventService } from "@/gradient/services/eventService";
import { ReferralLeaderboardRow } from "@/gradient/types/event";

interface ReferralTableProps {
  referrals: ReferralLeaderboardRow[];
  loading: boolean;
  onViewReferees: (row: ReferralLeaderboardRow) => void;
  refresh: () => void;
}

export default function ReferralTable({
  referrals,
  loading,
  onViewReferees,
  refresh,
}: ReferralTableProps) {
  const [updatingGuestId, setUpdatingGuestId] = useState<string | null>(null);

  const handleUpdateStatus = async (guestId: string, status: string) => {
    setUpdatingGuestId(guestId);
    const toastId = toast.loading(`Updating status to ${status}...`);
    try {
      await eventService.updateGuestStatus(guestId, status);
      toast.success(`Status updated to ${status} successfully`, { id: toastId });
      refresh();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to update status", {
        id: toastId,
      });
    } finally {
      setUpdatingGuestId(null);
    }
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Referrer</TableHead>
          <TableHead>Contact</TableHead>
          <TableHead>Referral Code</TableHead>
          <TableHead className="text-center">Referred</TableHead>
          <TableHead>Their Status</TableHead>
          <TableHead className="w-12"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {loading ? (
          <TableRow>
            <TableCell colSpan={6} className="h-32 text-center">
              <div className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading referrals...
              </div>
            </TableCell>
          </TableRow>
        ) : referrals.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={6}
              className="h-32 text-center text-muted-foreground"
            >
              No one has referred a guest to this event yet.
            </TableCell>
          </TableRow>
        ) : (
          referrals.map((row) => (
            <TableRow key={row.referrerUserId}>
              <TableCell className="font-medium">{row.name || "-"}</TableCell>
              <TableCell>
                <div className="text-sm">{row.email || "-"}</div>
                <div className="text-xs text-muted-foreground">
                  {row.phone || "-"}
                </div>
              </TableCell>
              <TableCell>
                <code className="text-xs bg-muted px-2 py-1 rounded-md">
                  {row.referralCode || "-"}
                </code>
              </TableCell>
              <TableCell className="text-center">
                <Badge variant="outline" className="font-semibold">
                  {row.referredCount}
                </Badge>
              </TableCell>
              <TableCell>
                {/* A referrer can share a link without registering themselves —
                    there is no guest row to act on in that case. */}
                {!row.guestId ? (
                  <span className="text-xs text-muted-foreground">
                    Not registered
                  </span>
                ) : updatingGuestId === row.guestId ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground w-36">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-xs">Updating...</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 min-w-[120px]">
                    <Badge
                      variant={
                        row.status === "Waitlisted"
                          ? "secondary"
                          : row.status === "Approved"
                            ? "default"
                            : "outline"
                      }
                      className="whitespace-nowrap"
                    >
                      {row.status}
                    </Badge>
                    {row.status !== "Approved" && (
                      <button
                        onClick={() => handleUpdateStatus(row.guestId!, "Approved")}
                        className="flex-shrink-0 text-emerald-600 hover:text-emerald-700 bg-emerald-50 hover:bg-emerald-100 p-1.5 rounded-md transition-colors"
                        title="Approve"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {row.status !== "Declined" && (
                      <button
                        onClick={() => handleUpdateStatus(row.guestId!, "Declined")}
                        className="flex-shrink-0 text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 p-1.5 rounded-md transition-colors"
                        title="Decline"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <button
                  onClick={() => onViewReferees(row)}
                  className="p-1.5 hover:bg-muted rounded-md"
                  title="View referred guests"
                >
                  <Eye className="h-4 w-4" />
                </button>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
