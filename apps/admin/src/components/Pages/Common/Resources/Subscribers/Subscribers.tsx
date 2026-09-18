"use client";

import { getAllSubscribers } from "@/services/resources/resourcesService";
import React, { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Download, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { HoverLoading } from "@/components/Common/Loading/HoverLoading";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

interface Subscriber {
  id: number;
  email: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export default function Subscribers() {
  const [allSubscribers, setAllSubscribers] = useState<Subscriber[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const router = useRouter();

  const getSubscribers = async () => {
    try {
      setIsLoading(true);
      const response = await getAllSubscribers();
      setAllSubscribers(response);
    } catch (error) {
      console.error("❌ Failed to fetch subscribers:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const downloadAsExcel = () => {
    if (!allSubscribers || allSubscribers.length === 0) return;

    // 1. Format and filter the data
    const formattedData = allSubscribers.map((guest) => ({
      Email: guest?.email || "",
      Time: new Date(guest.createdAt).toLocaleString(), // formatted date
    }));

    // 2. Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(formattedData);

    // 3. Apply bold style to header
    const headers = Object.keys(formattedData[0]);
    headers.forEach((_, index) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: index });
      if (worksheet[cellRef]) {
        worksheet[cellRef].s = {
          font: { bold: true },
        };
      }
    });

    // 4. Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Guests");

    // 5. Export with styles
    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
      cellStyles: true,
    });

    const blob = new Blob([excelBuffer], {
      type: "application/octet-stream",
    });

    saveAs(blob, "subscriber.xlsx");
  };

  useEffect(() => {
    getSubscribers();
  }, []);

  // 🔎 filter subscribers based on search term
  const filteredSubscribers = allSubscribers.filter((sub) => {
    const term = searchTerm.toLowerCase();
    return sub.email.toLowerCase().includes(term);
  });

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <div className="px-5 h-16 flex justify-between items-center border-b">
        <div className="flex items-center gap-2">
          <ArrowLeft
            className="h-5 w-5 m-2 cursor-pointer"
            onClick={() => router.back()}
          />
          <p className="text-lg font-semibold">All Subscribers</p>
        </div>

        <div className="flex items-center gap-4">
          {/* Search Box */}
          <Button
            onClick={downloadAsExcel}
            className="cursor-pointer flex items-center gap-2 bg-[#335DC8] hover:bg-[#335DC8] text-white"
          >
            <Download className="w-4 h-4" />
            Download
          </Button>

          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-[40px] pr-3 py-1 border rounded-md text-sm focus:outline-none focus:ring-2"
            />
          </div>

          <div className="text-sm text-muted-foreground">
            Total Subscribers: {filteredSubscribers.length}
          </div>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <HoverLoading
          title={"Please wait while we are fetching subscribers..."}
        />
      ) : (
        <div className="flex flex-col h-full flex-1 overflow-auto p-5 bg-gray-50">
          <div className="rounded-md border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Subscribed At</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubscribers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No subscribers found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSubscribers.map((sub, index) => (
                    <TableRow key={sub.id}>
                      <TableCell>{index + 1}</TableCell>
                      <TableCell>{sub.email}</TableCell>
                      <TableCell className="capitalize">{sub.status}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(sub.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
}
