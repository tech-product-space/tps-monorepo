"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Loader2,
  Plus,
  Search,
  X,
  Pencil,
  Trash2,
  FileText,
  CalendarDays,
  Upload,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Pagination from "@/components/ui/custom/Pagination";
import { debounce } from "@/utils/debounce";
import {
  deleteExpense,
  getCategories,
  getExpenses,
  getExpenseTotals,
  getPaymentAccounts,
  setExpenseStatus,
  type CurrencyTotal,
  type Expense,
  type ExpenseCategory,
  type ExpenseFilters,
  type ExpensePaymentAccount,
  type ExpenseStatus,
} from "@/services/expenses/expensesService";
import { getTeams, type ExpenseTeam } from "@/services/expenses/expenseFormsService";
import ExpensesNav from "./ExpensesNav";
import ExpenseFormDialog from "./ExpenseFormDialog";
import ImportExpensesDialog from "./ImportExpensesDialog";
import ExportExpensesDialog from "./ExportExpensesDialog";
import { formatCurrency, statusColor, toDateParam, resolveAttachment } from "./expenseUtils";

const ALL = "all";
const STATUSES: ExpenseStatus[] = ["paid", "pending", "reimbursed"];

// Notes can be long; show a clamped preview that opens the full note in a dialog.
const NotePreview = ({ title, note }: { title: string; note: string }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="View note"
        className="mt-0.5 block max-w-[240px] truncate text-left text-xs font-normal text-gray-500 hover:text-blue-600 hover:underline"
      >
        {note}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[90vw] sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="truncate">{title || "Note"}</DialogTitle>
          </DialogHeader>
          <p className="whitespace-pre-wrap break-words text-sm text-gray-700 max-h-[60vh] overflow-y-auto">
            {note}
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
};
const SOURCES = [
  { value: "internal", label: "Internal" },
  { value: "external", label: "External (forms)" },
];

const Expenses = () => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [teams, setTeams] = useState<ExpenseTeam[]>([]);
  const [accounts, setAccounts] = useState<ExpensePaymentAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [meta, setMeta] = useState({
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(ALL);
  const [subcategoryFilter, setSubcategoryFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [sourceFilter, setSourceFilter] = useState(ALL);
  const [teamFilter, setTeamFilter] = useState(ALL);
  const [accountFilter, setAccountFilter] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Per-currency totals across the whole filtered set (not just this page).
  const [totals, setTotals] = useState<CurrencyTotal[]>([]);
  // The filter signature the totals were last fetched for — lets us skip the
  // totals call on pure pagination/page-size changes (totals don't change), and
  // refetch only when filters/search change or a mutation forces it.
  const lastTotalsKey = useRef<string | null>(null);

  const fetchExpenses = async (
    page = 1,
    limit = meta.limit,
    overrides: Partial<{
      search: string;
      category: string;
      subcategory: string;
      status: string;
      source: string;
      team: string;
      account: string;
      from: string;
      to: string;
    }> = {},
    silent = false,
    forceTotals = false
  ) => {
    try {
      if (!silent) setIsLoading(true);
      const category = overrides.category ?? categoryFilter;
      const subcategory = overrides.subcategory ?? subcategoryFilter;
      const status = overrides.status ?? statusFilter;
      const source = overrides.source ?? sourceFilter;
      const team = overrides.team ?? teamFilter;
      const account = overrides.account ?? accountFilter;
      const filters = {
        search: overrides.search ?? searchTerm,
        categoryId: category === ALL ? undefined : category,
        subcategoryId: subcategory === ALL ? undefined : subcategory,
        status: status === ALL ? undefined : (status as ExpenseStatus),
        source: source === ALL ? undefined : (source as "internal" | "external"),
        teamId: team === ALL ? undefined : team,
        paymentAccountId: account === ALL ? undefined : account,
        from: toDateParam(overrides.from ?? from),
        to: toDateParam(overrides.to ?? to),
      };
      const res = await getExpenses({ page, limit, ...filters });
      setExpenses(res.data);
      setMeta(res.meta);

      // Refresh the currency totals only when the filter set actually changed
      // (or a mutation forces it) — not on page/limit navigation.
      const key = JSON.stringify(filters);
      if (forceTotals || key !== lastTotalsKey.current) {
        lastTotalsKey.current = key;
        getExpenseTotals(filters).then(setTotals).catch(() => {});
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load expenses");
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {});
    getTeams().then(setTeams).catch(() => {});
    getPaymentAccounts().then(setAccounts).catch(() => {});
    fetchExpenses(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const debouncedSearch = useMemo(
    () => debounce((value: string) => fetchExpenses(1, meta.limit, { search: value }), 400),
    [
      meta.limit,
      categoryFilter,
      subcategoryFilter,
      statusFilter,
      sourceFilter,
      teamFilter,
      accountFilter,
      from,
      to,
    ]
  );

  const hasActiveFilters =
    !!searchTerm ||
    categoryFilter !== ALL ||
    subcategoryFilter !== ALL ||
    statusFilter !== ALL ||
    sourceFilter !== ALL ||
    teamFilter !== ALL ||
    accountFilter !== ALL ||
    !!from ||
    !!to;

  // The live filter set, in the exact shape the API takes — shared by the export
  // so the downloaded file always matches what the list is showing.
  const currentFilters: ExpenseFilters = useMemo(
    () => ({
      search: searchTerm || undefined,
      categoryId: categoryFilter === ALL ? undefined : categoryFilter,
      subcategoryId: subcategoryFilter === ALL ? undefined : subcategoryFilter,
      status: statusFilter === ALL ? undefined : (statusFilter as ExpenseStatus),
      source: sourceFilter === ALL ? undefined : (sourceFilter as "internal" | "external"),
      teamId: teamFilter === ALL ? undefined : teamFilter,
      paymentAccountId: accountFilter === ALL ? undefined : accountFilter,
      from: toDateParam(from),
      to: toDateParam(to),
    }),
    [
      searchTerm,
      categoryFilter,
      subcategoryFilter,
      statusFilter,
      sourceFilter,
      teamFilter,
      accountFilter,
      from,
      to,
    ]
  );

  // Same filters, resolved to names for the export dialog + its summary sheet.
  const filterSummary = useMemo(() => {
    const out: { label: string; value: string }[] = [];
    if (searchTerm) out.push({ label: "Search", value: searchTerm });
    if (categoryFilter !== ALL) {
      out.push({
        label: "Category",
        value: categories.find((c) => c.id === categoryFilter)?.name || categoryFilter,
      });
    }
    if (subcategoryFilter !== ALL) {
      const sub = categories
        .flatMap((c) => c.subcategories ?? [])
        .find((s) => s.id === subcategoryFilter);
      out.push({ label: "Subcategory", value: sub?.name || subcategoryFilter });
    }
    if (statusFilter !== ALL) out.push({ label: "Status", value: statusFilter });
    if (sourceFilter !== ALL) {
      out.push({
        label: "Source",
        value: SOURCES.find((s) => s.value === sourceFilter)?.label || sourceFilter,
      });
    }
    if (teamFilter !== ALL) {
      out.push({ label: "Team", value: teams.find((t) => t.id === teamFilter)?.name || teamFilter });
    }
    if (accountFilter !== ALL) {
      out.push({
        label: "Payment account",
        value: accounts.find((a) => a.id === accountFilter)?.name || accountFilter,
      });
    }
    if (from || to) {
      out.push({ label: "Date", value: `${from || "start"} → ${to || "today"}` });
    }
    return out;
  }, [
    searchTerm,
    categoryFilter,
    subcategoryFilter,
    statusFilter,
    sourceFilter,
    teamFilter,
    accountFilter,
    from,
    to,
    categories,
    teams,
    accounts,
  ]);

  const clearFilters = () => {
    setSearchTerm("");
    setCategoryFilter(ALL);
    setSubcategoryFilter(ALL);
    setStatusFilter(ALL);
    setSourceFilter(ALL);
    setTeamFilter(ALL);
    setAccountFilter(ALL);
    setFrom("");
    setTo("");
    fetchExpenses(1, meta.limit, {
      search: "",
      category: ALL,
      subcategory: ALL,
      status: ALL,
      source: ALL,
      team: ALL,
      account: ALL,
      from: "",
      to: "",
    });
  };

  // Subcategories available for the currently selected category filter.
  const filterSubcategories = useMemo(
    () =>
      categoryFilter === ALL
        ? []
        : categories.find((c) => c.id === categoryFilter)?.subcategories ?? [],
    [categories, categoryFilter]
  );

  const handleStatusChange = async (id: string, status: ExpenseStatus) => {
    try {
      await setExpenseStatus(id, status);
      setExpenses((prev) => prev.map((e) => (e.id === id ? { ...e, status } : e)));
      toast.success("Status updated");
    } catch {
      toast.error("Failed to update status");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteExpense(deleteId);
      toast.success("Expense deleted");
      setDeleteId(null);
      fetchExpenses(meta.page, meta.limit, {}, true, true);
    } catch {
      toast.error("Failed to delete expense");
    }
  };

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (e: Expense) => {
    setEditing(e);
    setDialogOpen(true);
  };

  return (
    <div className="flex flex-col h-screen">
      <ExpensesNav
        right={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setExportOpen(true)} className="flex items-center gap-2">
              <Download className="h-4 w-4" /> Export
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)} className="flex items-center gap-2">
              <Upload className="h-4 w-4" /> Import CSV
            </Button>
            <Button onClick={openAdd} className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add expense
            </Button>
          </div>
        }
      />

      <div className="flex-1 bg-gray-50 overflow-auto p-5">
        {/* Filters */}
        <div className="mb-4 rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search title, vendor, name, email, phone..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                debouncedSearch(e.target.value);
              }}
              className="pl-9 pr-9 bg-white"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  debouncedSearch("");
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <Select
            value={categoryFilter}
            onValueChange={(v) => {
              setCategoryFilter(v);
              setSubcategoryFilter(ALL); // category changed — clear stale subcategory
              fetchExpenses(1, meta.limit, { category: v, subcategory: ALL });
            }}
          >
            <SelectTrigger className="w-40 bg-white">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={subcategoryFilter}
            onValueChange={(v) => {
              setSubcategoryFilter(v);
              fetchExpenses(1, meta.limit, { subcategory: v });
            }}
            disabled={categoryFilter === ALL || filterSubcategories.length === 0}
          >
            <SelectTrigger className="w-40 bg-white">
              <SelectValue placeholder="Subcategory" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All subcategories</SelectItem>
              {filterSubcategories.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              fetchExpenses(1, meta.limit, { status: v });
            }}
          >
            <SelectTrigger className="w-36 bg-white">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s} className="capitalize">
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={sourceFilter}
            onValueChange={(v) => {
              setSourceFilter(v);
              fetchExpenses(1, meta.limit, { source: v });
            }}
          >
            <SelectTrigger className="w-40 bg-white">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All sources</SelectItem>
              {SOURCES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={teamFilter}
            onValueChange={(v) => {
              setTeamFilter(v);
              fetchExpenses(1, meta.limit, { team: v });
            }}
          >
            <SelectTrigger className="w-40 bg-white">
              <SelectValue placeholder="Team" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All teams</SelectItem>
              {teams.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={accountFilter}
            onValueChange={(v) => {
              setAccountFilter(v);
              fetchExpenses(1, meta.limit, { account: v });
            }}
          >
            <SelectTrigger className="w-44 bg-white">
              <SelectValue placeholder="Payment account" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All accounts</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex h-9 items-center gap-1.5 rounded-md border border-input bg-white px-2.5">
            <CalendarDays className="h-4 w-4 shrink-0 text-gray-400" />
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                fetchExpenses(1, meta.limit, { from: e.target.value });
              }}
              aria-label="From date"
              className="w-[112px] bg-transparent text-sm text-gray-700 outline-none"
            />
            <span className="text-gray-300">–</span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                fetchExpenses(1, meta.limit, { to: e.target.value });
              }}
              aria-label="To date"
              className="w-[112px] bg-transparent text-sm text-gray-700 outline-none"
            />
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="ml-auto gap-1.5 text-gray-500 hover:text-gray-800"
            >
              <X className="h-3.5 w-3.5" /> Clear
            </Button>
          )}
          </div>
        </div>

        {/* Results + per-currency totals */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1 text-sm">
          <span className="text-gray-500">
            {meta.total} {meta.total === 1 ? "expense" : "expenses"}
          </span>
          <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-gray-600">
            {totals.length === 0 ? (
              <span className="text-gray-400">No matching expenses</span>
            ) : (
              <>
                <span className="text-gray-500">Total:</span>
                {totals.map((t) => (
                  <span key={t.currency} className="whitespace-nowrap">
                    <span className="font-semibold text-gray-900">
                      {formatCurrency(t.total, t.currency)}
                    </span>{" "}
                    <span className="text-gray-400 text-xs">({t.count})</span>
                  </span>
                ))}
              </>
            )}
          </div>
        </div>

        <div className="rounded-lg bg-white shadow">
          {isLoading ? (
            <div className="flex justify-center items-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
            </div>
          ) : expenses.length === 0 ? (
            <div className="py-16 text-center text-gray-500">No expenses found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Payment account</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Attachment</TableHead>
                  <TableHead>Added by</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {e.title}
                        {e.recurring_expense_id && (
                          <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                            recurring
                          </span>
                        )}
                        {e.source === "external" && (
                          <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded">
                            external
                          </span>
                        )}
                      </div>
                      {e.notes && <NotePreview title={e.title} note={e.notes} />}
                    </TableCell>
                    <TableCell>
                      {e.category?.name}
                      {e.subcategory?.name && (
                        <span className="text-gray-400"> / {e.subcategory.name}</span>
                      )}
                    </TableCell>
                    <TableCell>{e.expense_date}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(e.amount, e.currency)}
                    </TableCell>
                    <TableCell className="text-gray-600">
                      {e.paymentAccount?.name || "—"}
                    </TableCell>
                    <TableCell>
                      <Select value={e.status} onValueChange={(v) => handleStatusChange(e.id, v as ExpenseStatus)}>
                        <SelectTrigger
                          className={`h-7 w-32 border-0 capitalize ${statusColor[e.status] || ""}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="capitalize">
                              {s}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-gray-600">{e.vendor || "—"}</TableCell>
                    <TableCell>
                      {e.receipt_url ? (
                        <a
                          href={resolveAttachment(e.receipt_url)}
                          target="_blank"
                          rel="noreferrer"
                          title="View attachment"
                          className="inline-flex items-center gap-1 text-blue-600 hover:underline text-sm"
                        >
                          <FileText className="h-3.5 w-3.5" /> View
                        </a>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {e.source === "external" ? (
                        <div className="text-sm leading-tight">
                          <div className="font-medium">{e.submitter_name || "—"}</div>
                          <div className="text-xs text-gray-500">
                            {e.submitter_email || ""}
                            {e.submitter_phone ? ` · ${e.submitter_phone}` : ""}
                          </div>
                          <span className="text-[10px] text-teal-700">
                            External{e.team?.name ? ` · ${e.team.name}` : ""}
                          </span>
                        </div>
                      ) : (
                        <div className="text-sm leading-tight">
                          <div className="font-medium">{e.creator?.name || "Staff"}</div>
                          <div className="text-xs text-gray-500">{e.creator?.email || ""}</div>
                          <span className="text-[10px] text-gray-500">
                            Internal{e.recurring_expense_id ? " · auto" : ""}
                          </span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openEdit(e)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteId(e.id)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <div className="p-4">
        <Pagination
          meta={meta}
          onPageChange={(p) => fetchExpenses(p, meta.limit, {}, false)}
          onLimitChange={(l) => fetchExpenses(1, l)}
        />
      </div>

      <ExpenseFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        categories={categories}
        expense={editing}
        onSaved={() => fetchExpenses(meta.page, meta.limit, {}, true, true)}
      />

      <ImportExpensesDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => fetchExpenses(1, meta.limit, {}, true, true)}
      />

      <ExportExpensesDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        filters={currentFilters}
        filterSummary={filterSummary}
        matchCount={meta.total}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Expenses;
