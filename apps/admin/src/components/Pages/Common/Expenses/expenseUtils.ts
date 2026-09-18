// We now store only the S3 object key (path) for receipts and resolve it to a
// full URL here via the assets CDN. Legacy rows hold a full http(s) URL — those
// are returned untouched.
export const ASSET_BASE_URL = (
  process.env.NEXT_PUBLIC_AWS_FILE_BASE_URL || "https://assets.theproductspace.in"
).replace(/\/$/, "");

export const resolveAttachment = (path?: string | null): string => {
  if (!path) return "";
  if (/^https?:\/\//.test(path)) return path;
  return `${ASSET_BASE_URL}/${path.replace(/^\/+/, "")}`;
};

// Currencies an expense can be recorded in. Kept in sync with the backend's
// SUPPORTED_CURRENCIES (constants/expenses.js). Amounts are never converted.
export const SUPPORTED_CURRENCIES: { code: string; symbol: string; label: string }[] = [
  { code: "INR", symbol: "₹", label: "Indian Rupee" },
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "British Pound" },
  { code: "AED", symbol: "د.إ", label: "UAE Dirham" },
];

export const currencySymbol = (code?: string | null): string =>
  SUPPORTED_CURRENCIES.find((c) => c.code === code)?.symbol ?? code ?? "₹";

export const formatCurrency = (value: number | string, currency = "INR") => {
  const n = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
};

// Compact currency for tight spaces (chart axes / chips): ₹1.2Cr, $45K, etc.
// Currency-aware so non-INR amounts get the right symbol and grouping.
export const compactCurrency = (value: number | string, currency = "INR") => {
  const n = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
};

export const statusColor: Record<string, string> = {
  paid: "bg-green-100 text-green-700",
  pending: "bg-amber-100 text-amber-700",
  reimbursed: "bg-blue-100 text-blue-700",
};

// Solid swatch colours for status visualisations (segments/legends).
export const statusSwatch: Record<string, string> = {
  paid: "bg-emerald-500",
  pending: "bg-amber-500",
  reimbursed: "bg-sky-500",
};

// `expense_date` is a DATE column (no time), so date filters must be compared
// date-to-date. The date input already gives an ISO 8601 date ("YYYY-MM-DD") —
// send it straight through. (Previously we expanded it to a UTC start/end-of-day
// timestamp, which in a DB timezone ahead of UTC pushed the inclusive upper
// bound onto the next calendar day, leaking e.g. the 16th into a "≤ 15th" range.)
export const toDateParam = (dateStr: string): string | undefined =>
  dateStr ? dateStr : undefined;
