"use client";

import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, Download, Loader2, AlertTriangle } from "lucide-react";
import { bulkUploadCohortMembers } from "@/services/cohort-members/cohort-members";
import { useNotification } from "@/helpers/NotificationContext";

type FailedRow = {
  rowNumber: number;
  row: Record<string, any>;
  error: string;
};

interface UploadCsvDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const UploadCsvDialog = ({
  open,
  onClose,
  onSuccess,
}: UploadCsvDialogProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(false);

  const [failedRows, setFailedRows] = useState<FailedRow[]>([]);
  const [summary, setSummary] = useState<{
    total: number;
    success: number;
    failed: number;
  } | null>(null);

  const downloadSampleCsv = () => {
    const csv = `name,email,phone,course,cohort,role,status
Rahul Sharma,rahul.sharma@gmail.com,9876543210,Advanced AI Program,Jan 2025,Student,Active
Ananya Verma,ananya.verma@gmail.com,9123456780,Product Management Fellowship,Feb 2025,Student,Inactive`;

    downloadCsv(csv, "cohort-members-sample.csv");
  };

  const downloadFailedCsv = () => {
    if (!failedRows.length) return;

    const headers = ["rowNumber", "error", ...Object.keys(failedRows[0].row)];

    const rows = failedRows.map((r) => [
      r.rowNumber,
      r.error,
      ...headers.slice(2).map((h) => r.row[h] ?? ""),
    ]);

    const csv =
      headers.join(",") +
      "\n" +
      rows.map((r) => r.map(escapeCsv).join(",")).join("\n");

    downloadCsv(csv, "cohort-members-failed.csv");
  };

  const escapeCsv = (value: any) =>
    `"${String(value ?? "").replace(/"/g, '""')}"`;

  const downloadCsv = (content: string, filename: string) => {
    const blob = new Blob([content], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      showNotification("error", "Invalid File", "Please upload a CSV file.");
      e.target.value = "";
      return;
    }

    setLoading(true);
    setFailedRows([]);
    setSummary(null);

    try {
      const response = await bulkUploadCohortMembers(file);

      setSummary(response.summary);
      setFailedRows(response.errorRows || []);

      if (response.summary.failed === 0) {
        showNotification(
          "success",
          "Bulk Upload Completed",
          `Successfully uploaded ${response.summary.success} members`
        );
        onSuccess?.();
        onClose();
      } else {
        showNotification(
          "warning",
          "Upload Completed with Errors",
          `${response.summary.failed} rows failed. See details below.`
        );
      }
    } catch (error: any) {
      showNotification(
        "error",
        "Upload Failed",
        error?.response?.data?.message || "Failed to upload CSV file."
      );
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk Upload Cohort Members</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={downloadSampleCsv}
          >
            <Download className="h-4 w-4 mr-2" />
            Download Sample CSV
          </Button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleFileChange}
          />

          <Button
            className="w-full"
            disabled={loading}
            onClick={() => fileInputRef.current?.click()}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Upload CSV File
              </>
            )}
          </Button>
        </div>

        {summary && (
          <div className="bg-muted rounded-md p-3 text-sm">
            <p>Total Rows: {summary.total}</p>
            <p className="text-green-600">Success: {summary.success}</p>
            <p className="text-red-600">Failed: {summary.failed}</p>
          </div>
        )}

        {failedRows.length > 0 && (
          <div className="mt-4 space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="font-semibold flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-4 w-4" />
                Failed Rows
              </h4>

              <Button variant="outline" size="sm" onClick={downloadFailedCsv}>
                <Download className="h-4 w-4 mr-1" />
                Download Failed CSV
              </Button>
            </div>

            <div className="max-h-64 overflow-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Row</th>
                    <th className="px-3 py-2 text-left">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {failedRows.map((r) => (
                    <tr key={r.rowNumber} className="border-t">
                      <td className="px-3 py-2">{r.rowNumber}</td>
                      <td className="px-3 py-2 text-red-600">{r.error}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
