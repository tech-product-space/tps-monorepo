"use client";
import { useState, type ReactNode } from "react";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { AlertTriangle, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { exportExpenses, type ExpenseFilters } from "@/services/expenses/expensesService";
import {
  buildExportRows,
  buildSummaryRows,
  EXPORT_COLUMNS,
  exportFileStem,
  toCsv,
  type Cell,
  type FilterChip,
} from "./expenseExportData";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Exact filter set the list is currently showing (page/limit are ignored). */
  filters: ExpenseFilters;
  /** Human-readable version of the same filters, for the dialog + summary sheet. */
  filterSummary: FilterChip[];
  /** Rows matching those filters, as reported by the list's meta.total. */
  matchCount: number;
}

type Format = "xlsx" | "csv";

// Mirrors EXPORT_ROW_CAP on the server — only used to warn before exporting.
const ROW_CAP = 20000;

const ExportExpensesDialog = ({
  open,
  onOpenChange,
  filters,
  filterSummary,
  matchCount,
}: Props) => {
  const [format, setFormat] = useState<Format>("xlsx");
  const [includeSummary, setIncludeSummary] = useState(true);
  const [exporting, setExporting] = useState(false);

  const baseName = exportFileStem(filters.from, filters.to);

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await exportExpenses(filters);
      if (!res.data.length) {
        toast.warning("Nothing to export for these filters");
        return;
      }

      const aoa: Cell[][] = buildExportRows(res.data);

      if (format === "csv") {
        saveAs(
          new Blob([toCsv(aoa)], { type: "text/csv;charset=utf-8;" }),
          `${baseName}.csv`
        );
      } else {
        const workbook = XLSX.utils.book_new();
        const sheet = XLSX.utils.aoa_to_sheet(aoa);
        // Roomy-but-bounded widths so titles/notes aren't a single character wide.
        sheet["!cols"] = EXPORT_COLUMNS.map((c) => ({
          wch: Math.min(Math.max(c.header.length + 2, 12), 40),
        }));
        sheet["!autofilter"] = {
          ref: XLSX.utils.encode_range({
            s: { r: 0, c: 0 },
            e: { r: aoa.length - 1, c: EXPORT_COLUMNS.length - 1 },
          }),
        };
        XLSX.utils.book_append_sheet(workbook, sheet, "Expenses");

        if (includeSummary) {
          const summary = XLSX.utils.aoa_to_sheet(buildSummaryRows(res.data, filterSummary));
          summary["!cols"] = [{ wch: 14 }, { wch: 34 }, { wch: 16 }, { wch: 10 }];
          XLSX.utils.book_append_sheet(workbook, summary, "Summary");
        }

        const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
        saveAs(new Blob([buffer], { type: "application/octet-stream" }), `${baseName}.xlsx`);
      }

      if (res.truncated) {
        toast.warning(
          `Exported the first ${res.count.toLocaleString()} of ${res.total.toLocaleString()} rows — narrow the date range for the rest.`
        );
      } else {
        toast.success(`Exported ${res.count.toLocaleString()} expense${res.count === 1 ? "" : "s"}`);
      }
      onOpenChange(false);
    } catch (err) {
      console.error("Export failed:", err);
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const FormatCard = ({
    value,
    icon,
    title,
    hint,
  }: {
    value: Format;
    icon: ReactNode;
    title: string;
    hint: string;
  }) => (
    <button
      type="button"
      onClick={() => setFormat(value)}
      className={`flex flex-1 items-start gap-3 rounded-lg border p-3 text-left transition ${
        format === value
          ? "border-blue-500 bg-blue-50/60 ring-1 ring-blue-500"
          : "border-gray-200 hover:bg-gray-50"
      }`}
    >
      <span className={format === value ? "text-blue-600" : "text-gray-400"}>{icon}</span>
      <span>
        <span className="block text-sm font-medium text-gray-900">{title}</span>
        <span className="block text-xs text-gray-500">{hint}</span>
      </span>
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(next) => !exporting && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export expenses</DialogTitle>
          <DialogDescription>
            Downloads every expense matching the filters currently applied to the list — not just
            the page you can see.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-gray-700">Filters applied</span>
              <span className="text-gray-500">
                {matchCount.toLocaleString()} {matchCount === 1 ? "row" : "rows"}
              </span>
            </div>
            {filterSummary.length === 0 ? (
              <p className="text-xs text-gray-500">
                No filters — the whole expense history will be exported.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {filterSummary.map((f) => (
                  <span
                    key={f.label}
                    className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-600 ring-1 ring-gray-200"
                  >
                    <span className="text-gray-400">{f.label}:</span> {f.value}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <FormatCard
              value="xlsx"
              icon={<FileSpreadsheet className="h-5 w-5" />}
              title="Excel (.xlsx)"
              hint="Filterable sheet + optional summary"
            />
            <FormatCard
              value="csv"
              icon={<FileText className="h-5 w-5" />}
              title="CSV (.csv)"
              hint="Plain text, opens anywhere"
            />
          </div>

          {format === "xlsx" && (
            <label className="flex cursor-pointer items-start gap-2.5 text-sm text-gray-700">
              <Checkbox
                checked={includeSummary}
                onCheckedChange={(v) => setIncludeSummary(v === true)}
                className="mt-0.5"
              />
              <span>
                Add a summary sheet
                <span className="block text-xs text-gray-500">
                  Totals by currency, category, subcategory, status, team, source, payment account
                  and month — for the same filtered rows.
                </span>
              </span>
            </label>
          )}

          {matchCount > ROW_CAP && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Only the first 20,000 rows are exported at a time. Narrow the date range to get the
                rest.
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={exporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {exporting ? "Preparing…" : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportExpensesDialog;
