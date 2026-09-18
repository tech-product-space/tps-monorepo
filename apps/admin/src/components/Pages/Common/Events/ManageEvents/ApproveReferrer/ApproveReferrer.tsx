"use client";

import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";

export default function ApproveReferrer({ data }: { data: any[] }) {
  console.log("Referrals:", data);

  return (
    <div className="rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Members</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={6}
                className="text-center py-8 text-muted-foreground"
              >
                No referrals found
              </TableCell>
            </TableRow>
          ) : (
            data.map((guest: any) => (
              <TableRow key={guest.id}>
                <TableCell className="font-medium">{guest.name}</TableCell>
                <TableCell>{guest.memberCount}</TableCell>
                <TableCell>{guest.phone || "N/A"}</TableCell>
                <TableCell>{guest.guestType || "N/A"}</TableCell>
                <TableCell className="text-right">
                  {guest.guestType === "Approved" ||
                  guest.guestType === "Declined" ? (
                    <span
                      className={`font-medium px-2 py-1 rounded border
    ${
      guest.guestType === "Approved"
        ? "bg-green-100 border-green-500 text-green-700"
        : guest.guestType === "Declined"
        ? "bg-red-100 border-red-500 text-red-700"
        : "bg-gray-100 border-gray-400 text-gray-700"
    }`}
                    >
                      {guest.guestType}
                    </span>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-600 hover:bg-green-50 bg-transparent"
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-600 hover:bg-red-50 bg-transparent"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
