"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/gradient/components/ui/button";
import * as XLSX from "xlsx";
import { resolveStorageUrl } from "@/gradient/lib/storage";

interface DownloadExcelButtonProps {
  fetchPage: (
    page: number,
    limit: number,
  ) => Promise<{ data: any[]; meta: { hasNextPage: boolean } }>;
  filename: string;
  className?: string;
  variant?:
    | "default"
    | "outline"
    | "secondary"
    | "ghost"
    | "link"
    | "destructive";
}

const formatDate = (isoString: string) => {
  const date = new Date(isoString);

  return date.toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export function DownloadExcelButton({
  fetchPage,
  filename,
  className,
  variant = "outline",
}: DownloadExcelButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      let page = 1;
      let allData: any[] = [];
      let hasNextPage = true;
      const limit = 50;

      while (hasNextPage) {
        const response = await fetchPage(page, limit);
        if (response && response.data) {
          allData = [...allData, ...response.data];
        }

        if (response && response.meta) {
          hasNextPage = response.meta.hasNextPage;
        } else {
          hasNextPage = false;
        }
        page++;
      }

      if (allData.length === 0) return;

      // Flatten objects, especially 'additionalData'
      const flattenedData = allData.map((item) => {
        const flatItem: any = {};

        for (const key in item) {
          const value = item[key]; 
          if (
            key === "additionalData" &&
            typeof item[key] === "object" &&
            item[key] !== null
          ) {
            for (const addKey in item[key]) {
              const value = item[key][addKey];

              if (addKey === "resumeKey" && value) {
                flatItem["resumeUrl"] = resolveStorageUrl(value);
              } else {
                flatItem[addKey] = value;
              }
            }
          } else if ((key === "createdAt" || key === "updatedAt") && value) {
            flatItem[key] = formatDate(value);
          } else if (typeof item[key] !== "object") {
            flatItem[key] = item[key];
          }
        }

        return flatItem;
      });
      // Creates worksheet
      const worksheet = XLSX.utils.json_to_sheet(flattenedData);

      // Create workbook and append worksheet
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Data");

      // Trigger download
      XLSX.writeFile(workbook, `${filename}.xlsx`);
    } catch (error) {
      console.error("Error downloading Excel:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      onClick={handleDownload}
      disabled={loading}
      variant={variant}
      className={className}
    >
      {loading ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Preparing...
        </>
      ) : (
        <>
          <Download className="mr-2 h-4 w-4" />
          Export Excel
        </>
      )}
    </Button>
  );
}
