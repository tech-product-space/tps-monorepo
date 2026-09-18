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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import {
  MoreHorizontal,
  Eye,
  Edit,
  Trash2,
  Copy,
  CheckCheck,
} from "lucide-react";
import { ReferralSummary } from "../Referees";
import { useState } from "react";

interface ReferralTableProps {
  referrals: ReferralSummary[];
  onViewReferredUsers: (id: string) => void;
  onEditMember: (member: ReferralSummary) => void;
  onDeleteMember: (member: ReferralSummary) => void;
  copyReferralLink: (referralCode: string) => void;
}

export const ReferralTable = ({
  referrals,
  onViewReferredUsers,
  onEditMember,
  onDeleteMember,
  copyReferralLink,
}: ReferralTableProps) => {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  const handleCopy = (e: React.MouseEvent, referralCode: string) => {
    e.stopPropagation();
    copyReferralLink(referralCode);
    setCopiedCode(referralCode);
    setTimeout(() => setCopiedCode(null), 1000); // Reset after 1s
  };

  const getTypeBadgeVariant = (type: string) => {
    switch (type.toLowerCase()) {
      case "student":
        return "default";
      case "professional":
        return "secondary";
      default:
        return "outline";
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
            {/* <TableHead>Type</TableHead> */}
            <TableHead>Referral Code</TableHead>
            <TableHead>Members</TableHead>
            <TableHead className="text-right">Actions</TableHead>
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
                onClick={(e) => {
                  e.stopPropagation(); // ✅ Prevent row click
                  onViewReferredUsers(referral.id);
                }}
                className="cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <TableCell className="font-medium">{referral.name}</TableCell>
                <TableCell>{referral.email || "N/A"}</TableCell>
                <TableCell>{referral.phone || "N/A"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <code className="bg-muted px-2 py-1 rounded text-sm">
                      {referral.referralCode}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation(); // ✅ Prevent row click
                        copyReferralLink(referral.referralCode);
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{referral.memberCount}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation(); // ✅ Prevent row click
                          onEditMember(referral);
                        }}
                      >
                        <Edit className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation(); // ✅ Prevent row click
                          onDeleteMember(referral);
                        }}
                        className="text-red-600"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};
