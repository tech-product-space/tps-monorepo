"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { Badge } from "@/gradient/components/ui/badge";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { eventService } from "@/gradient/services/eventService";
import { ReferralLeaderboardRow, ReferredGuest } from "@/gradient/types/event";

interface RefereesDialogProps {
  eventId: string;
  referrer: ReferralLeaderboardRow | null;
  onClose: () => void;
}

export default function RefereesDialog({
  eventId,
  referrer,
  onClose,
}: RefereesDialogProps) {
  const [referees, setReferees] = useState<ReferredGuest[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!referrer) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const res = await eventService.getReferees(
          eventId,
          referrer.referrerUserId,
        );
        if (!cancelled) setReferees(res.data);
      } catch (error: any) {
        if (!cancelled) {
          toast.error(
            error.response?.data?.message || "Failed to fetch referred guests",
          );
          setReferees([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [eventId, referrer]);

  return (
    <Dialog open={!!referrer} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl! w-full! max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Referred by {referrer?.name || "this user"}
            {referrer?.referralCode ? (
              <code className="ml-2 text-xs font-normal bg-muted px-2 py-1 rounded-md">
                {referrer.referralCode}
              </code>
            ) : null}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading referred guests...
          </div>
        ) : referees.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No referred guests yet.
          </p>
        ) : (
          <ul className="divide-y border rounded-md">
            {referees.map((guest) => (
              <li
                key={guest.id}
                className="flex justify-between items-center gap-4 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{guest.name}</p>
                  <p className="text-sm text-muted-foreground truncate">
                    {guest.email || "-"}
                  </p>
                  <p className="text-xs text-muted-foreground">{guest.phone}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="outline">{guest.attendeeType}</Badge>
                  <Badge
                    variant={
                      guest.status === "Waitlisted"
                        ? "secondary"
                        : guest.status === "Approved"
                          ? "default"
                          : "outline"
                    }
                  >
                    {guest.status}
                  </Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
