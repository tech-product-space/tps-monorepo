// Pure shaping logic for the expense export: what the columns are, how a row
// becomes cells, how the summary sheet is laid out, and CSV serialisation. Kept
// free of React/XLSX so the file's contents can be reasoned about (and tested)
// on their own — ExportExpensesDialog only wires this to the download.
import type { Expense } from "@/services/expenses/expensesService";

export type Cell = string | number;

export interface FilterChip {
  label: string;
  value: string;
}

/* --------------------------------- columns --------------------------------- */

// Every field an expense carries, in a spreadsheet-friendly order. Joined names
// are used (not ids) except for the row id, which stays for cross-referencing.
export const EXPORT_COLUMNS: { header: string; get: (e: Expense) => Cell }[] = [
  { header: "Date", get: (e) => e.expense_date || "" },
  { header: "Title", get: (e) => e.title || "" },
  { header: "Amount", get: (e) => Number(e.amount) || 0 },
  { header: "Currency", get: (e) => e.currency || "" },
  { header: "Category", get: (e) => e.category?.name || "" },
  { header: "Subcategory", get: (e) => e.subcategory?.name || "" },
  { header: "Status", get: (e) => e.status || "" },
  { header: "Payment Method", get: (e) => e.payment_method || "" },
  { header: "Payment Account", get: (e) => e.paymentAccount?.name || "" },
  { header: "Vendor", get: (e) => e.vendor || "" },
  { header: "Team", get: (e) => e.team?.name || "" },
  { header: "Source", get: (e) => e.source || "" },
  { header: "Recurring", get: (e) => (e.recurring_expense_id ? "Yes" : "No") },
  { header: "Submitted Via Form", get: (e) => e.form?.name || "" },
  { header: "Submitter Name", get: (e) => e.submitter_name || "" },
  { header: "Submitter Email", get: (e) => e.submitter_email || "" },
  { header: "Submitter Phone", get: (e) => e.submitter_phone || "" },
  { header: "Added By", get: (e) => e.creator?.name || "" },
  { header: "Added By Email", get: (e) => e.creator?.email || "" },
  { header: "Notes", get: (e) => e.notes || "" },
  { header: "Receipt", get: (e) => e.receipt_url || "" },
  { header: "Expense ID", get: (e) => e.id },
  { header: "Logged At", get: (e) => (e.createdAt ? new Date(e.createdAt).toLocaleString() : "") },
];

export const exportHeader = (): string[] => EXPORT_COLUMNS.map((c) => c.header);

/** Header row followed by one row per expense — the data sheet / CSV body. */
export const buildExportRows = (rows: Expense[]): Cell[][] => [
  exportHeader(),
  ...rows.map((e) => EXPORT_COLUMNS.map((c) => c.get(e))),
];

/* ---------------------------------- csv ------------------------------------ */

/** RFC-4180 quoting: wrap in quotes and double any embedded quote. */
export const csvCell = (value: Cell | null | undefined) =>
  `"${String(value ?? "").replace(/"/g, '""')}"`;

/** CRLF-joined CSV text with a BOM, so Excel reads UTF-8 (₹, é) correctly. */
export const toCsv = (rows: Cell[][]) =>
  "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

/* -------------------------------- aggregation ------------------------------ */

export interface TotalsGroup {
  key: string;
  currency: string;
  total: number;
  count: number;
}

// Group totals by (currency, key) — amounts in different currencies are never
// added together, matching how the list footer and dashboard report them.
export const groupTotals = (rows: Expense[], keyOf: (e: Expense) => string): TotalsGroup[] => {
  const map = new Map<string, TotalsGroup>();
  rows.forEach((e) => {
    const key = keyOf(e) || "—";
    const currency = e.currency || "INR";
    const id = `${currency}::${key}`;
    const entry = map.get(id) || { key, currency, total: 0, count: 0 };
    entry.total += Number(e.amount) || 0;
    entry.count += 1;
    map.set(id, entry);
  });
  // Round after summing so 0.1 + 0.2 style float drift never reaches the sheet.
  return [...map.values()]
    .map((e) => ({ ...e, total: Math.round(e.total * 100) / 100 }))
    .sort((a, b) => a.currency.localeCompare(b.currency) || b.total - a.total);
};

/** The summary sheet: the filters that produced the file, then the breakdowns. */
export const buildSummaryRows = (
  rows: Expense[],
  filterSummary: FilterChip[],
  generatedAt = new Date()
): Cell[][] => {
  const out: Cell[][] = [
    ["Expense export summary"],
    ["Generated at", generatedAt.toLocaleString()],
    ["Rows exported", rows.length],
    [],
    ["Applied filters"],
    ...(filterSummary.length
      ? filterSummary.map((f) => [f.label, f.value] as Cell[])
      : [["(none)", "All expenses"] as Cell[]]),
  ];

  const section = (title: string, keyLabel: string, entries: TotalsGroup[]) => {
    out.push([], [title], ["Currency", keyLabel, "Total", "Count"]);
    entries.forEach((e) => out.push([e.currency, e.key, e.total, e.count]));
  };

  section("Total by currency", "—", groupTotals(rows, () => "All"));
  section("By category", "Category", groupTotals(rows, (e) => e.category?.name || "Uncategorized"));
  section(
    "By subcategory",
    "Subcategory",
    groupTotals(rows, (e) =>
      e.subcategory?.name ? `${e.category?.name || "—"} / ${e.subcategory.name}` : "(none)"
    )
  );
  section("By status", "Status", groupTotals(rows, (e) => e.status));
  section("By team", "Team", groupTotals(rows, (e) => e.team?.name || "No team"));
  section("By source", "Source", groupTotals(rows, (e) => e.source));
  section(
    "By payment account",
    "Account",
    groupTotals(rows, (e) => e.paymentAccount?.name || "(none)")
  );
  section("By month", "Month", groupTotals(rows, (e) => (e.expense_date || "").slice(0, 7)));

  return out;
};

/** `expenses_2026-01-01_to_2026-03-31_2026-08-12` — range-aware file stem. */
export const exportFileStem = (
  from?: string,
  to?: string,
  today = new Date().toISOString().slice(0, 10)
) => {
  const range = from || to ? `_${from || "start"}_to_${to || "today"}` : "";
  return `expenses${range}_${today}`;
};
