"use client";

import { getAllLeads } from "@/services/resources/resourcesService";
import React, { useEffect, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Download, Phone, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { HoverLoading } from "@/components/Common/Loading/HoverLoading";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { saveAs } from "file-saver";

interface Lead {
  id: number;
  name: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  createdAt?: any;
  resource?: {
    title?: string | number;
    name?: string;
  };
  updatedAt: any;
}

export default function AllLeads() {
  const [allLeadData, setAllLeadData] = useState<Lead[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>("");
  const router = useRouter();

  const getLeads = async () => {
    try {
      setIsLoading(true);
      const response = await getAllLeads();
      setAllLeadData(response);
    } catch (error) {
      console.error("❌ Failed to fetch leads:", error);
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
    if (!allLeadData || allLeadData.length === 0) return;

    // STEP 1: Collect all dynamic additionalData keys
    const additionalKeys = new Set<string>();

    allLeadData.forEach((lead: any) => {
      if (lead.additionalData && typeof lead.additionalData === "object") {
        Object.keys(lead.additionalData).forEach((key) => {
          additionalKeys.add(key);
        });
      }
    });

    const dynamicFields = Array.from(additionalKeys);

    // STEP 2: Build formatted rows including dynamic fields
    const formattedData = allLeadData.map((lead: any) => {
      const row: any = {
        Resource: lead?.resource?.title || "",
        Name: lead.name,
        Phone: lead.phone,
        Email: lead.email || "",
        Job: lead.jobTitle || "",
        Time: new Date(lead.createdAt).toLocaleString(),
      };

      dynamicFields.forEach((field) => {
        row[field] = lead.additionalData?.[field] || "";
      });

      return row;
    });

    // STEP 3: Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(formattedData);

    // STEP 4: Apply bold styling to header row
    const headers = Object.keys(formattedData[0]);
    headers.forEach((_, index) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: index });
      if (worksheet[cellRef]) {
        worksheet[cellRef].s = {
          font: { bold: true },
        };
      }
    });

    // STEP 5: Create workbook & append sheet
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "All Leads");

    // STEP 6: Export Excel with styling
    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
      cellStyles: true,
    });

    const blob = new Blob([excelBuffer], {
      type: "application/octet-stream",
    });

    saveAs(blob, "resources_all_leads.xlsx");
  };

  useEffect(() => {
    getLeads();
  }, []);

  // 🔎 filter data based on search term
  const filteredLeads = allLeadData.filter((guest) => {
    const term = searchTerm.toLowerCase();
    return (
      guest.name?.toLowerCase().includes(term) ||
      guest.email?.toLowerCase().includes(term) ||
      guest.phone?.toLowerCase().includes(term) ||
      guest.jobTitle?.toLowerCase().includes(term) ||
      guest?.resource?.title?.toString().toLowerCase().includes(term)
    );
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
          <p className="text-lg font-semibold">All Leads</p>
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
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 h-[40px] pr-3 py-1 border rounded-md text-sm focus:outline-none focus:ring-2"
            />
          </div>

          <div className="text-sm text-muted-foreground">
            Total Guests: {filteredLeads.length}
          </div>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <HoverLoading
          title={"Please wait while we are fetching the guests..."}
        />
      ) : (
        <div className="flex flex-col h-full flex-1 overflow-auto p-5 bg-gray-50">
          <div className="rounded-md border bg-white">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resource Name</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Date & Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No guests found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLeads
                    .sort(
                      (a, b) =>
                        new Date(b.updatedAt).getTime() -
                        new Date(a.updatedAt).getTime()
                    )
                    .map((guest) => (
                      <TableRow key={guest.id}>
                        <TableCell>
                          <div className="font-medium">
                            {guest?.resource?.title}
                          </div>
                        </TableCell>
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
                          <span className="text-sm">
                            {guest?.jobTitle || "N/A"}
                          </span>
                        </TableCell>

                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(guest?.createdAt) || "N/A"}
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
