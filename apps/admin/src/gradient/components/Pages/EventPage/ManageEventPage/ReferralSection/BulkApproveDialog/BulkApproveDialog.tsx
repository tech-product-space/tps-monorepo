"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { eventService } from "@/gradient/services/eventService";

interface BulkApproveDialogProps {
  eventId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  refresh: () => void;
}

export default function BulkApproveDialog({
  eventId,
  open,
  onOpenChange,
  refresh,
}: BulkApproveDialogProps) {
  const [minReferrals, setMinReferrals] = useState(1);
  const [affectedCount, setAffectedCount] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    if (open) {
      setMinReferrals(1);
      setAffectedCount(null);
    }
  }, [open]);

  // Debounced dry-run so the preview stays accurate across every page of the
  // leaderboard, not just the rows currently loaded in the table.
  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setPreviewing(true);

    const timer = setTimeout(async () => {
      try {
        const res = await eventService.bulkApproveByReferralCount(
          eventId,
          minReferrals,
          true,
        );
        if (!cancelled) setAffectedCount(res.affectedCount);
      } catch {
        if (!cancelled) setAffectedCount(null);
      } finally {
        if (!cancelled) setPreviewing(false);
      }
    }, 350);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [eventId, minReferrals, open]);

  const handleApprove = async () => {
    setApproving(true);
    const toastId = toast.loading("Approving referrers...");
    try {
      const res = await eventService.bulkApproveByReferralCount(
        eventId,
        minReferrals,
      );
      toast.success(
        res.updatedCount
          ? `${res.updatedCount} referrer(s) approved`
          : res.message,
        { id: toastId },
      );
      onOpenChange(false);
      refresh();
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Failed to approve referrers",
        { id: toastId },
      );
    } finally {
      setApproving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md! w-full!">
        <DialogHeader>
          <DialogTitle>Bulk Approve by Referral Count</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="minReferrals">Minimum guests referred (≥)</Label>
            <Input
              id="minReferrals"
              type="number"
              min={1}
              value={minReferrals}
              onChange={(e) => {
                const val = parseInt(e.target.value, 10);
                setMinReferrals(Number.isNaN(val) || val < 1 ? 1 : val);
              }}
            />
          </div>

          <p className="text-sm text-muted-foreground flex items-center gap-2 min-h-5">
            {previewing ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Checking who this affects...
              </>
            ) : affectedCount === null ? (
              "Could not preview the affected guests."
            ) : affectedCount > 0 ? (
              <>
                This will approve{" "}
                <span className="font-medium text-foreground">
                  {affectedCount} waitlisted referrer
                  {affectedCount !== 1 ? "s" : ""}
                </span>
                {" "}and email each of them a calendar invite.
              </>
            ) : (
              "No waitlisted referrers match this criteria."
            )}
          </p>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={approving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={approving || previewing || !affectedCount}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {approving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Approving...
                </>
              ) : (
                `Approve ${affectedCount ?? 0} Referrer${affectedCount === 1 ? "" : "s"}`
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
