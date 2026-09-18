import { UnsubscribedUser } from "@/types/campaign";
import * as XLSX from "xlsx";
import { format } from "date-fns";

export const exportUnsubscribedUsersToExcel = (data: UnsubscribedUser[]) => {
  if (!data || data.length === 0) {
    throw new Error("No data available for export");
  }

  const sourceLabel = (item: UnsubscribedUser) => {
    if (!item.lead_source_type) return "Email only";
    return item.lead_source_id
      ? `${item.lead_source_type}:${item.lead_source_id}`
      : item.lead_source_type;
  };

  const excelData: Record<string, string | number>[] = data.map((item) => ({
    Email: item.email || "N/A",
    Source: sourceLabel(item),
    Reason: item.reason || "N/A",
    "Unsubscribed At": item.createdAt
      ? format(new Date(item.createdAt), "MMM d, yyyy HH:mm")
      : "N/A",
  }));

  // Worksheet
  const worksheet = XLSX.utils.json_to_sheet(excelData);

  // Auto column width (now safe)
  const maxWidth = 50;

  if (excelData.length > 0) {
    const colWidths = Object.keys(excelData[0]).map((key) => {
      const maxLength = Math.max(
        key.length,
        ...excelData.map((row) => String(row[key] || "").length),
      );
      return { wch: Math.min(maxLength + 2, maxWidth) };
    });

    worksheet["!cols"] = colWidths;
  }

  // Workbook
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Unsubscribed Users");

  const filename = `Unsubscribed Users List`;

  // Download
  XLSX.writeFile(workbook, `${filename}.xlsx`);
};
