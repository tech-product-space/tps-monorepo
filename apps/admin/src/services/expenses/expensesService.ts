import { PrivateAxios, PrivateUploadAxios } from "@/helpers/PrivateAxios";

/* --------------------------------- types ---------------------------------- */

export type ExpenseStatus = "paid" | "pending" | "reimbursed";

export interface ExpenseSubcategory {
  id: string;
  category_id: string;
  name: string;
  is_active: boolean;
}

export interface ExpenseCategory {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  subcategories?: ExpenseSubcategory[];
}

export interface ExpensePaymentAccount {
  id: string;
  name: string;
  is_active: boolean;
}

export interface Expense {
  id: string;
  title: string;
  amount: string; // DECIMAL comes back as a string
  currency: string;
  expense_date: string;
  category_id: string;
  subcategory_id: string | null;
  status: ExpenseStatus;
  payment_method: string | null;
  payment_account_id: string | null;
  vendor: string | null;
  notes: string | null;
  receipt_url: string | null;
  recurring_expense_id: string | null;
  created_by: number | null;
  source: "internal" | "external";
  expense_form_id: string | null;
  team_id: string | null;
  submitter_name: string | null;
  submitter_email: string | null;
  submitter_phone: string | null;
  createdAt: string;
  category?: { id: string; name: string };
  subcategory?: { id: string; name: string } | null;
  team?: { id: string; name: string } | null;
  paymentAccount?: { id: string; name: string } | null;
  creator?: { id: number; name: string; email: string } | null;
  // Only returned by the export endpoint (the list doesn't join the form).
  form?: { id: string; name: string } | null;
  updatedAt?: string;
}

export interface RecurringExpense {
  id: string;
  title: string;
  amount: string;
  currency: string;
  category_id: string;
  subcategory_id: string | null;
  payment_method: string | null;
  payment_account_id: string | null;
  vendor: string | null;
  notes: string | null;
  frequency: string;
  day_of_month: number;
  is_active: boolean;
  last_run_date: string | null;
  category?: { id: string; name: string };
  subcategory?: { id: string; name: string } | null;
  paymentAccount?: { id: string; name: string } | null;
}

export interface ExpenseFilters {
  page?: number;
  limit?: number;
  categoryId?: string;
  subcategoryId?: string;
  status?: ExpenseStatus | "";
  from?: string;
  to?: string;
  search?: string;
  source?: "internal" | "external" | "";
  teamId?: string;
  paymentAccountId?: string;
}

export interface ExpenseSummary {
  currency: string;
  total: number;
  count: number;
  byCurrency: { currency: string; total: number; count: number }[];
  byCategory: { categoryId: string; categoryName: string; total: number; count: number }[];
  byMonth: { month: string; total: number }[];
  byStatus: { status: string; total: number; count: number }[];
  byTeam: { teamId: string | null; teamName: string; total: number; count: number }[];
  bySource: { source: "internal" | "external"; total: number; count: number }[];
}

/* ------------------------------- categories ------------------------------- */

export const getCategories = async (includeArchived = false) => {
  const res = await PrivateAxios.get("/expenses/categories", {
    params: includeArchived ? { all: true } : {},
  });
  return res.data.data as ExpenseCategory[];
};

export const createCategory = async (payload: { name: string; type?: string }) => {
  const res = await PrivateAxios.post("/expenses/categories", payload);
  return res.data.data as ExpenseCategory;
};

export const updateCategory = async (
  id: string,
  payload: { name?: string; type?: string; is_active?: boolean }
) => {
  const res = await PrivateAxios.put(`/expenses/categories/${id}`, payload);
  return res.data.data as ExpenseCategory;
};

export const archiveCategory = async (id: string) => {
  const res = await PrivateAxios.delete(`/expenses/categories/${id}`);
  return res.data;
};

export const createSubcategory = async (categoryId: string, name: string) => {
  const res = await PrivateAxios.post(`/expenses/categories/${categoryId}/subcategories`, {
    name,
  });
  return res.data.data as ExpenseSubcategory;
};

export const updateSubcategory = async (
  id: string,
  payload: { name?: string; is_active?: boolean }
) => {
  const res = await PrivateAxios.put(`/expenses/subcategories/${id}`, payload);
  return res.data.data as ExpenseSubcategory;
};

export const archiveSubcategory = async (id: string) => {
  const res = await PrivateAxios.delete(`/expenses/subcategories/${id}`);
  return res.data;
};

/* -------------------------------- expenses -------------------------------- */

export const getExpenses = async (filters: ExpenseFilters = {}) => {
  const res = await PrivateAxios.get("/expenses", { params: filters });
  return { data: res.data.data as Expense[], meta: res.data.meta };
};

export const getExpenseById = async (id: string) => {
  const res = await PrivateAxios.get(`/expenses/${id}`);
  return res.data.data as Expense;
};

export const createExpense = async (payload: Partial<Expense>) => {
  const res = await PrivateAxios.post("/expenses", payload);
  return res.data.data as Expense;
};

export const updateExpense = async (id: string, payload: Partial<Expense>) => {
  const res = await PrivateAxios.put(`/expenses/${id}/update`, payload);
  return res.data.data as Expense;
};

export const setExpenseStatus = async (id: string, status: ExpenseStatus) => {
  const res = await PrivateAxios.patch(`/expenses/${id}/status`, { status });
  return res.data.data as Expense;
};

export const deleteExpense = async (id: string) => {
  const res = await PrivateAxios.delete(`/expenses/${id}`);
  return res.data;
};

export const uploadReceipt = async (file: File) => {
  const form = new FormData();
  form.append("receipt", file);
  const res = await PrivateUploadAxios.post("/expenses/upload-receipt", form);
  return res.data as { success: boolean; url: string; key: string };
};

/* ---------------------------- payment accounts ----------------------------- */

export const getPaymentAccounts = async (includeArchived = false) => {
  const res = await PrivateAxios.get("/expenses/payment-accounts", {
    params: includeArchived ? { all: true } : {},
  });
  return res.data.data as ExpensePaymentAccount[];
};

// Creating a name that already exists returns the existing account (and
// un-archives it), so the "Add" path in the combobox is safe to call blindly.
export const createPaymentAccount = async (name: string) => {
  const res = await PrivateAxios.post("/expenses/payment-accounts", { name });
  return res.data.data as ExpensePaymentAccount;
};

export const updatePaymentAccount = async (
  id: string,
  payload: { name?: string; is_active?: boolean }
) => {
  const res = await PrivateAxios.put(`/expenses/payment-accounts/${id}`, payload);
  return res.data.data as ExpensePaymentAccount;
};

export const archivePaymentAccount = async (id: string) => {
  const res = await PrivateAxios.delete(`/expenses/payment-accounts/${id}`);
  return res.data;
};

/* --------------------------------- export --------------------------------- */

export interface ExpenseExportResult {
  data: Expense[];
  count: number; // rows actually returned
  total: number; // rows matching the filters
  truncated: boolean; // true when total > cap and rows were cut off
  cap: number;
}

// Every row matching the current filters/search — unpaginated, with the joined
// category/subcategory/team/account/creator/form names, so the download mirrors
// exactly what the filtered list shows. Capped server-side (see `truncated`).
export const exportExpenses = async (
  filters: ExpenseFilters = {}
): Promise<ExpenseExportResult> => {
  // Pagination is meaningless here — the endpoint returns the whole filter set.
  const params: ExpenseFilters = { ...filters };
  delete params.page;
  delete params.limit;

  const res = await PrivateAxios.get("/expenses/export", { params });
  return {
    data: res.data.data as Expense[],
    count: res.data.count as number,
    total: res.data.total as number,
    truncated: !!res.data.truncated,
    cap: res.data.cap as number,
  };
};

/* -------------------------------- bulk import ------------------------------ */

// Column order of the CSV template — also the header of the failed-rows file the
// user downloads, so a corrected file can be re-uploaded unchanged.
export const IMPORT_COLUMNS = [
  "title",
  "amount",
  "currency",
  "expense_date",
  "category",
  "subcategory",
  "status",
  "payment_method",
  "payment_account",
  "vendor",
  "team",
  "notes",
] as const;

export interface ImportRowError {
  row: number; // spreadsheet line number, header counted
  original: Record<string, string>;
  errors: { column: string; message: string }[];
}

export interface ImportResult {
  totalRows: number;
  imported: number;
  failed: number;
  // Payment accounts the file introduced — the import creates them rather than
  // rejecting the row, so they're reported back to catch typos.
  createdAccounts: string[];
  errors: ImportRowError[];
}

// Imports every valid row and skips the invalid ones — the failures come back
// with their original cells so the caller can offer a fix-and-retry download.
// Whole-file problems (missing columns, >1000 rows) reject with a 422 instead.
export const importExpenses = async (file: File) => {
  const form = new FormData();
  form.append("file", file);
  const res = await PrivateUploadAxios.post("/expenses/import", form);
  return res.data as ImportResult & { success: boolean };
};

/* --------------------------------- reports -------------------------------- */

export interface CurrencyTotal {
  currency: string;
  total: number;
  count: number;
}

// Per-currency totals for the list footer — honours the list filters/search but
// covers the whole result set (not just the visible page). Lightweight endpoint,
// separate from the main list query.
export const getExpenseTotals = async (filters: ExpenseFilters = {}) => {
  const res = await PrivateAxios.get("/expenses/totals", { params: filters });
  return res.data.data as CurrencyTotal[];
};

export const getSummary = async (
  params: {
    from?: string;
    to?: string;
    status?: string;
    teamId?: string;
    source?: string;
    currency?: string;
  } = {}
) => {
  const res = await PrivateAxios.get("/expenses/reports/summary", { params });
  return res.data.data as ExpenseSummary;
};

/* -------------------------------- recurring ------------------------------- */

export const getRecurring = async () => {
  const res = await PrivateAxios.get("/expenses/recurring");
  return res.data.data as RecurringExpense[];
};

export const createRecurring = async (payload: Partial<RecurringExpense>) => {
  const res = await PrivateAxios.post("/expenses/recurring", payload);
  return res.data.data as RecurringExpense;
};

export const updateRecurring = async (id: string, payload: Partial<RecurringExpense>) => {
  const res = await PrivateAxios.put(`/expenses/recurring/${id}`, payload);
  return res.data.data as RecurringExpense;
};

export const toggleRecurring = async (id: string) => {
  const res = await PrivateAxios.patch(`/expenses/recurring/${id}/toggle`);
  return res.data.data as RecurringExpense;
};

export const deleteRecurring = async (id: string) => {
  const res = await PrivateAxios.delete(`/expenses/recurring/${id}`);
  return res.data;
};

// Manually trigger the same generation the cron does: creates a pending expense
// for every active template whose day-of-month is today (and not already run
// this month). Returns how many were generated.
export const runRecurring = async () => {
  const res = await PrivateAxios.post("/expenses/recurring/run");
  return res.data as { success: boolean; generated: number; expenseIds: string[] };
};
