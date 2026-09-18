"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Download } from "lucide-react";
import {
  getIndividualResourceLeads,
  getResourcesById,
} from "@/services/resources/resourcesService";
import LeadsTable from "./LeadsTable/LeadsTable";
import Overview from "./Overview/Overview";
import { Button } from "@/components/ui/button";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

export interface ILead {
  id: number;
  name: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  resourceId: number;
  createdAt: string;
  updatedAt: string;
}

// API response can be direct array or wrapped response
export interface IApiResponse {
  result?: string;
  registrations?: ILead[];
  message?: string;
}

const GuestLists = () => {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [resourceData, setResourceData] = useState<any>([]);
  const [guests, setGuests] = useState<ILead[]>([]);
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState("overview");
  const id = pathname.split("/").pop();

  const fetchGuests = async (eventId: string | number) => {
    try {
      setIsLoading(true);
      const response = await getIndividualResourceLeads(id);

      if (Array.isArray(response)) {
        setGuests(response);
      } else if (response.result === "SUCCESS" && response.registrations) {
        setGuests(response.registrations);
      } else if (response.result === "SUCCESS") {
        setGuests(response as unknown as ILead[]);
      } else {
        console.error(
          "Failed to fetch guests:",
          response.message || "Unknown error",
        );
        setGuests([]);
      }
    } catch (error) {
      console.error("Error fetching guests:", error);
      setGuests([]);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchResourceInfo = async (eventId: string) => {
    const response = await getResourcesById(eventId);
    setResourceData(response);
  };

  const downloadAsExcel = () => {
    if (!guests || guests.length === 0) return;

    const formattedData = guests.map((guest: any) => {
      const additional = guest.additionalData || {};

      const baseData: any = {
        ID: guest.id,
        Name: guest.name,
        Phone: guest.phone,
        Email: guest.email || "",
        "Job Title": guest.jobTitle || "",
        "Resource ID": guest.resourceId || "",
      };

      return {
        ...baseData,
        ...Object.fromEntries(
          Object.entries(additional).map(([key, val]) => [key, val ?? ""]),
        ),
        // "Leads91 Synced": guest.leads91Synced ?? "",
        // "Leads91 Synced At": guest.leads91SyncedAt
        //   ? new Date(guest.leads91SyncedAt).toLocaleString()
        //   : "",
        "Created At": new Date(guest.createdAt).toLocaleString(),
        "Updated At": new Date(guest.updatedAt).toLocaleString(),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedData);

    // Bold headers
    const headers = Object.keys(formattedData[0]);
    headers.forEach((_, index) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: index });
      if (worksheet[cellRef]) {
        worksheet[cellRef].s = {
          font: { bold: true },
        };
      }
    });

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Guests");

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array",
      cellStyles: true,
    });

    const blob = new Blob([excelBuffer], { type: "application/octet-stream" });
    saveAs(blob, `${resourceData?.title || "guest_list"}.xlsx`);
  };

  useEffect(() => {
    if (id) {
      fetchGuests(id);
      fetchResourceInfo(id);
    }
  }, [id]);

  return (
    <div className="flex flex-col h-screen">
      <div className="px-5 h-18 flex justify-between items-center border-b">
        <div className="flex items-center gap-2">
          <ArrowLeft
            className="h-5 w-5 m-2 cursor-pointer"
            onClick={() => router.back()}
          />
          <p className="text-lg font-semibold">Manage Resource</p>
        </div>
        <div className="flex items-center gap-4">
          <Button
            onClick={downloadAsExcel}
            className="cursor-pointer w-fit  flex items-center gap-2 text-white"
          >
            <Download className="w-4 h-4" />
            Download Leads
          </Button>
          <div className="text-sm text-muted-foreground">
            Total Guests: {guests.length}
          </div>
        </div>
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="flex flex-col h-[calc(100vh-4.5rem)] mb-5 p-5 bg-gray-50"
      >
        <TabsList className="grid w-full grid-cols-6 bg-transparent border-b border-gray-200 rounded-none h-auto p-0">
          <TabsTrigger
            value="overview"
            className="data-[state=active]:border-0 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent rounded-none pb-4"
          >
            Overview
          </TabsTrigger>
          <TabsTrigger
            value="guests"
            className="data-[state=active]:border-0 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent rounded-none pb-4"
          >
            Leads
          </TabsTrigger>
        </TabsList>
        <div className="flex-1 min-h-0 overflow-y-auto py-8">
          <TabsContent value="overview" className="mt-0 mb-5 px-10">
            <Overview resourceData={resourceData} />
          </TabsContent>
          <TabsContent value="guests" className="mt-0 mb-5 px-10">
            <LeadsTable guests={guests} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
};

export default GuestLists;
