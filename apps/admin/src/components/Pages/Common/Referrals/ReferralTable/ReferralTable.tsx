"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ReferralSummary } from "../Referrals";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ReferralTableProps {
  referrals: ReferralSummary[];
}

export const ReferralTable = ({ referrals }: ReferralTableProps) => {
  const [open, setOpen] = useState(false);
  const [selectedReferrer, setSelectedReferrer] = useState<
    ReferralSummary["referrer"] | null
  >(null);

  const handleRowClick = (referrer: ReferralSummary["referrer"]) => {
    if (referrer) {
      setSelectedReferrer(referrer);
      setOpen(true);
    }
  };

  return (
    <div className="rounded-md p-8">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Type</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {referrals.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={7}
                className="text-center py-8 text-muted-foreground"
              >
                No referrals found
              </TableCell>
            </TableRow>
          ) : (
            referrals.map((referral) => (
              <TableRow
                key={referral.id}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => handleRowClick(referral.referrer)}
              >
                <TableCell className="font-medium">{referral.name}</TableCell>
                <TableCell>{referral.email || "N/A"}</TableCell>
                <TableCell>{referral.phone || "N/A"}</TableCell>
                <TableCell>
                  <Badge variant="outline">{referral.type}</Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Dialog for showing referrer details */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Referrer Details</DialogTitle>
          </DialogHeader>
          {selectedReferrer ? (
            <div className="space-y-2">
              <p>
                <span className="font-semibold">Name:</span>{" "}
                {selectedReferrer.name}
              </p>
              <p>
                <span className="font-semibold">Email:</span>{" "}
                {selectedReferrer.email}
              </p>
              <p>
                <span className="font-semibold">Referral Code:</span>{" "}
                {selectedReferrer.referralCode}
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground">No referrer details</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
