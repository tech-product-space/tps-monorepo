"use client";

import React, { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { PREDEFINED_TYPES } from "../PlatformLeads/data/FormTypes";
import { downloadPlatformLeads } from "@/services/Leads/platformLeadServices";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { autoSizeColumns } from "@/utils/xlsx";

function formatDateTime(dateString: string): string {
  if (!dateString) return "";

  const date = new Date(dateString);

  const day = date.getDate();
  const month = date.toLocaleString("en-US", { month: "short" });
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = date.getMinutes().toString().padStart(2, "0");

  const ampm = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  const formattedTime = `${hours.toString().padStart(2, "0")}:${minutes} ${ampm}`;

  return `${day} ${month} ${year}, ${formattedTime}`;
}

type DataType = (typeof PREDEFINED_TYPES)[number] | "all";

interface DownloadDialogProps {
  open: boolean;
  onClose: () => void;
}

export const DownloadDialog: React.FC<DownloadDialogProps> = ({
  open,
  onClose,
}) => {
  const [selectedType, setSelectedType] = useState<DataType>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");

  const formatTypeName = (type: string): string =>
    type
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

  const mapLeadForExcel = (lead: any): Record<string, any> => {
    const flatAdditional: Record<string, any> = {};

    if (lead.additionalData && typeof lead.additionalData === "object") {
      Object.entries(lead.additionalData).forEach(([key, value]) => {
        flatAdditional[key] = value;
      });
    }

    return {
      id: lead.id,
      name: lead.name,
      email: lead.email,
      phone: lead.phone,
      type: lead.type,
      status: lead.status,
      assignedTo: lead.assignedTo,
      createdAt: formatDateTime(lead.createdAt),
      ...flatAdditional,
    };
  };

  /** Get all additionalData keys from all rows */
  const getAllAdditionalKeys = (rows: any[]) => {
    const keys = new Set<string>();
    rows.forEach((row) => {
      if (row.additionalData) {
        Object.keys(row.additionalData).forEach((k) => keys.add(k));
      }
    });
    return Array.from(keys);
  };

  /** Ensure all rows have same columns */
  const prepareExcelRows = (rows: any[]) => {
    const additionalKeys = getAllAdditionalKeys(rows);

    return rows.map((lead) => {
      const base: Record<string, any> = mapLeadForExcel(lead);

      additionalKeys.forEach((key) => {
        if (!(key in base)) base[key] = "";
      });

      return base;
    });
  };

  const downloadData = async () => {
    if (!selectedType) {
      setError("Please select a data type");
      return;
    }

    // Validate date range
    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      setError("Start Date cannot be greater than End Date");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const apiResponse = await downloadPlatformLeads(
        selectedType,
        startDate || undefined,
        endDate || undefined
      );

      const excelResponse = apiResponse.data;

      const workbook = XLSX.utils.book_new();

      const formattedRows = prepareExcelRows(excelResponse);
      const worksheet = XLSX.utils.json_to_sheet(formattedRows);

      worksheet['!cols'] = autoSizeColumns(formattedRows);

      XLSX.utils.book_append_sheet(workbook, worksheet, "Data");

      const excelBuffer = XLSX.write(workbook, {
        bookType: "xlsx",
        type: "array",
      });

      saveAs(
        new Blob([excelBuffer]),
        `${selectedType}-data-${new Date().toISOString().split("T")[0]}.xlsx`
      );

      onClose();
      setSelectedType("");
      setStartDate("");
      setEndDate("");
    } catch (err: any) {
      setError(err.message ?? "Download failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Download Data</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* SELECT FIELD */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">Select Data Type</label>

            <Select
              onValueChange={(value) => {
                setSelectedType(value as DataType);
                setError("");
              }}
              disabled={loading}
              value={selectedType}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="-- Select Type --" />
              </SelectTrigger>

              <SelectContent>
                <SelectItem value="all">All Data (Single Sheet)</SelectItem>

                {PREDEFINED_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {formatTypeName(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 📅 DATE RANGE */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Start Date</label>
            <input
              type="date"
              value={startDate}
              disabled={loading}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">End Date</label>
            <input
              type="date"
              value={endDate}
              disabled={loading}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>

          {/* ERROR */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* INFO */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-sm text-blue-800">
              {selectedType === "all"
                ? "All platform leads will be merged into one Excel sheet."
                : "This type will be exported into one Excel sheet."}
            </p>
          </div>
        </div>

        <DialogFooter className="mt-4 flex justify-end gap-3">
          <DialogClose asChild>
            <button
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              disabled={loading}
            >
              Cancel
            </button>
          </DialogClose>

          <button
            onClick={downloadData}
            disabled={loading || !selectedType}
            className="bg-[#335DC8] hover:bg-[#2a4da3] text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Download
              </>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
