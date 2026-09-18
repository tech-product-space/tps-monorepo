"use client";
import { useRef, useState } from "react";
import axios from "axios";
import { AlertTriangle, CheckCircle2, Download, FileUp, Loader2 } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  importExpenses,
  IMPORT_COLUMNS,
  type ImportResult,
} from "@/services/expenses/expensesService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

/** RFC-4180 quoting: wrap in quotes and double any embedded quote. */
const csvCell = (value: string) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const downloadCsv = (filename: string, rows: string[][]) => {
  // BOM so Excel opens UTF-8 (₹, é) correctly instead of mangling it.
  const body = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

const ImportExpensesDialog = ({ open, onOpenChange, onImported }: Props) => {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setResult(null);
    setFileError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setResult(null);
    setFileError(null);
    try {
      const res = await importExpenses(file);
      setResult(res);
      if (res.imported > 0) {
        toast.success(`Imported ${res.imported} expense${res.imported === 1 ? "" : "s"}`);
        onImported();
      }
      if (res.failed > 0) {
        toast.warning(`${res.failed} row${res.failed === 1 ? "" : "s"} skipped`);
      }
    } catch (err) {
      // 422 = the whole file was rejected before anything was attempted.
      const message = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : "Failed to import";
      setFileError(message);
      toast.error(message);
    } finally {
      setImporting(false);
    }
  };

  // Failed rows only, original cells plus the reasons — same header as the
  // template, so fixing this file and re-uploading it just works.
  const downloadFailedRows = () => {
    if (!result?.errors.length) return;
    const header = [...IMPORT_COLUMNS, "error"];
    const rows = result.errors.map((e) => [
      ...IMPORT_COLUMNS.map((c) => e.original[c] ?? ""),
      e.errors.map((x) => `${x.column}: ${x.message}`).join(" | "),
    ]);
    downloadCsv("expenses-failed-rows.csv", [header as unknown as string[], ...rows]);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import expenses from CSV</DialogTitle>
          <DialogDescription>
            Valid rows are imported and invalid ones are skipped — nothing partial is saved for a
            row that fails. Max 1000 rows per file.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-3 text-sm">
          <a
            href="/templates/bulk-expense-template.csv"
            download
            className="inline-flex items-center gap-1.5 text-blue-600 hover:underline"
          >
            <Download className="h-4 w-4" /> Download template
          </a>
          <a
            href="/templates/bulk-expense-rules.csv"
            download
            className="inline-flex items-center gap-1.5 text-blue-600 hover:underline"
          >
            <Download className="h-4 w-4" /> Allowed values
          </a>
        </div>

        <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg py-8 cursor-pointer hover:bg-gray-50 text-sm text-gray-600">
          <FileUp className="h-6 w-6 text-gray-400" />
          {file ? (
            <span className="font-medium text-gray-800">{file.name}</span>
          ) : (
            <span>Click to choose a .csv file</span>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setFileError(null);
            }}
          />
        </label>

        {fileError && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{fileError}</span>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-4 rounded-md border p-3 text-sm">
              <span className="inline-flex items-center gap-1.5 text-green-700">
                <CheckCircle2 className="h-4 w-4" />
                {result.imported} imported
              </span>
              {result.failed > 0 && (
                <span className="inline-flex items-center gap-1.5 text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  {result.failed} skipped
                </span>
              )}
              <span className="text-gray-500">of {result.totalRows} rows</span>
              {result.failed > 0 && (
                <Button size="sm" variant="outline" onClick={downloadFailedRows} className="ml-auto">
                  <Download className="h-4 w-4 mr-1.5" />
                  Download failed rows
                </Button>
              )}
            </div>

            {result.createdAccounts?.length > 0 && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                Added {result.createdAccounts.length} new payment account
                {result.createdAccounts.length === 1 ? "" : "s"}:{" "}
                <span className="font-medium">{result.createdAccounts.join(", ")}</span>. Check the
                Payment accounts tab if any of those look like a typo.
              </div>
            )}

            {result.failed > 0 && (
              <>
                <p className="text-xs text-gray-500">
                  Skipped rows aren&apos;t stored anywhere — download them before closing this
                  dialog, fix the problems, and upload that file again.
                </p>
                <div className="max-h-64 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-16">Row</TableHead>
                        <TableHead className="w-40">Column</TableHead>
                        <TableHead>Problem</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {result.errors.flatMap((e) =>
                        e.errors.map((x, i) => (
                          <TableRow key={`${e.row}-${x.column}-${i}`}>
                            <TableCell className="font-mono text-xs">{e.row}</TableCell>
                            <TableCell className="font-mono text-xs">{x.column}</TableCell>
                            <TableCell className="text-sm">{x.message}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={importing}>
            {result ? "Done" : "Cancel"}
          </Button>
          <Button onClick={handleImport} disabled={!file || importing}>
            {importing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {result ? "Import again" : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportExpensesDialog;
