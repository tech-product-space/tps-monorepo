import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Phone } from "lucide-react";


const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function LeadsTable({ guests }: { guests: any }) {


  return (
    <div className="flex flex-col h-full flex-1 overflow-auto bg-white ">
      {/* Search Box */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Contact</TableHead>
              <TableHead>Job Title</TableHead>
              <TableHead>Registered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {guests.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="text-center py-8 text-muted-foreground"
                >
                  No guests found for this resource.
                </TableCell>
              </TableRow>
            ) : (
              guests
                .sort(
                  (a: any, b: any) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime()
                )
                .map((guest: any) => (
                  <TableRow key={guest.id}>
                    <TableCell>
                      <div className="font-medium">{guest.name}</div>
                    </TableCell>
                    <TableCell>
                      <div>{guest.email}</div>
                    </TableCell>

                    <TableCell>
                      <div className="space-y-1">
                        {guest.phone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-3 w-3" />
                            <span>{guest.phone}</span>
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell>
                      <span className="text-sm">{guest.jobTitle || "N/A"}</span>
                    </TableCell>

                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(guest.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
