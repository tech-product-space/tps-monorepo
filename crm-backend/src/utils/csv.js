/**
 * CSV cell encoding, shared by every server-side extract.
 *
 * Three exports had each grown a private `escape` and their own idea of how to
 * write a phone number. This is the one place that decides — the mirror of
 * tps-crm/src/lib/csv.ts on the client, which does the same job for the exports
 * built in the browser.
 */

/**
 * Date formatting for CSV extracts.
 *
 * Deliberately `yyyy-mm-dd hh:mm` rather than the app's display format: Excel
 * parses it as a real date in every locale, whereas "20 Jul 2026, 3:30 PM" lands
 * as text and can't be sorted or filtered.
 */
function formatDateTimeForExport(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";

  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    ` ${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

/** Quote a value only when it contains something that would break the row. */
function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * A value the spreadsheet must reproduce verbatim.
 *
 * Excel reads a leading `+` as the start of a FORMULA, so `+919876543210` is
 * evaluated to 919876543210 and then rendered as 9.19877E+11 — the mangled
 * phone numbers in every export that predates this helper. Even without the
 * `+`, a long digit string goes scientific on its own and any leading zero is
 * silently dropped.
 *
 * `="…"` is the portable way to pin a cell to text — Excel, LibreOffice and
 * Google Sheets all honour it — and it doubles as an escape hatch for the same
 * formula parsing that caused the bug.
 *
 * Use it for phone numbers, reference codes, and anything else that is a string
 * of digits rather than a quantity.
 */
function csvText(value) {
  if (value === null || value === undefined) return "";
  const s = String(value).trim();
  return s ? `="${s.replace(/"/g, '""')}"` : "";
}

/** snake_case / camelCase key → "Title Case" column heading. */
function toHeader(key) {
  return String(key)
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Header row + escaped body, joined with CRLF (what Excel expects). */
function buildCsv(headers, rows) {
  return [headers.join(","), ...rows.map((cells) => cells.join(","))].join("\r\n");
}

module.exports = {
  formatDateTimeForExport,
  csvEscape,
  csvText,
  toHeader,
  buildCsv,
};
