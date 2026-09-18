"use client";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Play, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  createRecurring,
  deleteRecurring,
  getCategories,
  getRecurring,
  runRecurring,
  toggleRecurring,
  type ExpenseCategory,
  type RecurringExpense,
} from "@/services/expenses/expensesService";
import ExpensesNav from "./ExpensesNav";
import { formatCurrency, currencySymbol } from "./expenseUtils";
import { CurrencySelect } from "./CurrencySelect";
import { PaymentAccountCombobox } from "./PaymentAccountCombobox";

const NONE = "__none__";
const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "upi", "other"];

const RecurringExpenses = () => {
  const [items, setItems] = useState<RecurringExpense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // form state
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState(NONE);
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [vendor, setVendor] = useState("");
  const [paymentMethod, setPaymentMethod] = useState(NONE);
  const [paymentAccount, setPaymentAccount] = useState<string | null>(null);
  const [notes, setNotes] = useState("");

  const load = async () => {
    try {
      setLoading(true);
      const [rec, cats] = await Promise.all([getRecurring(), getCategories()]);
      setItems(rec);
      setCategories(cats);
    } catch {
      toast.error("Failed to load recurring expenses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const subcategories = useMemo(
    () => categories.find((c) => c.id === categoryId)?.subcategories ?? [],
    [categories, categoryId]
  );

  const resetForm = () => {
    setTitle("");
    setAmount("");
    setCurrency("INR");
    setCategoryId("");
    setSubcategoryId(NONE);
    setDayOfMonth("1");
    setVendor("");
    setPaymentMethod(NONE);
    setPaymentAccount(null);
    setNotes("");
  };

  const handleCreate = async () => {
    if (!title.trim()) return toast.error("Title is required");
    if (!amount || isNaN(Number(amount)) || Number(amount) < 0)
      return toast.error("Enter a valid amount");
    if (!categoryId) return toast.error("Select a category");
    const day = Number(dayOfMonth);
    if (!Number.isInteger(day) || day < 1 || day > 28)
      return toast.error("Day must be between 1 and 28");

    try {
      setSaving(true);
      await createRecurring({
        title: title.trim(),
        amount,
        currency,
        category_id: categoryId,
        subcategory_id: subcategoryId === NONE ? null : subcategoryId,
        day_of_month: day,
        vendor: vendor.trim() || null,
        payment_method: paymentMethod === NONE ? null : paymentMethod,
        payment_account_id: paymentAccount,
        notes: notes.trim() || null,
      });
      toast.success("Recurring expense added");
      setOpen(false);
      resetForm();
      load();
    } catch {
      toast.error("Failed to add recurring expense");
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = async (id: string) => {
    try {
      const updated = await toggleRecurring(id);
      setItems((prev) => prev.map((i) => (i.id === id ? { ...i, is_active: updated.is_active } : i)));
    } catch {
      toast.error("Failed to toggle");
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteRecurring(deleteId);
      toast.success("Deleted");
      setDeleteId(null);
      load();
    } catch {
      toast.error("Failed to delete");
    }
  };

  // Manually fire the cron's generation: creates pending expenses for templates
  // due today. Lets you test a recurring template without waiting for the cron
  // (set its day-of-month to today first).
  const handleRunNow = async () => {
    try {
      setRunning(true);
      const res = await runRecurring();
      if (res.generated > 0) {
        toast.success(`Generated ${res.generated} expense${res.generated > 1 ? "s" : ""}`);
      } else {
        toast.info("Nothing due today (templates fire on their day-of-month)");
      }
      load();
    } catch {
      toast.error("Failed to run recurring");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <ExpensesNav
        right={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleRunNow}
              disabled={running}
              title="Generate today's due recurring expenses now (instead of waiting for the daily job)"
              className="flex items-center gap-2"
            >
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run due now
            </Button>
            <Button onClick={() => setOpen(true)} className="flex items-center gap-2">
              <Plus className="h-4 w-4" /> Add recurring
            </Button>
          </div>
        }
      />

      <div className="flex-1 bg-gray-50 overflow-auto p-5">
        <p className="text-sm text-gray-500 mb-4">
          Recurring templates auto-create a <span className="font-medium">pending</span> expense on
          their day each month.
        </p>
        <div className="rounded-lg bg-white shadow">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-600" />
            </div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center text-gray-500">No recurring expenses.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.title}</TableCell>
                    <TableCell>
                      {r.category?.name}
                      {r.subcategory?.name && <span className="text-gray-400"> / {r.subcategory.name}</span>}
                    </TableCell>
                    <TableCell className="text-gray-600">{r.vendor || "—"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(r.amount, r.currency)}</TableCell>
                    <TableCell>{r.day_of_month}</TableCell>
                    <TableCell className="text-gray-600">{r.last_run_date || "—"}</TableCell>
                    <TableCell>
                      <Switch checked={r.is_active} onCheckedChange={() => handleToggle(r.id)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-red-500 hover:text-red-700"
                        onClick={() => setDeleteId(r.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add recurring expense</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Office rent" />
            </div>
            <div className="grid grid-cols-[auto_1fr_1fr] gap-3">
              <div className="grid gap-1.5">
                <Label>Currency</Label>
                <CurrencySelect value={currency} onValueChange={setCurrency} />
              </div>
              <div className="grid gap-1.5">
                <Label>Amount ({currencySymbol(currency)})</Label>
                <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label>Day of month (1–28)</Label>
                <Input type="number" min="1" max="28" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Category</Label>
                <Select
                  value={categoryId}
                  onValueChange={(v) => {
                    setCategoryId(v);
                    setSubcategoryId(NONE);
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>Subcategory</Label>
                <Select value={subcategoryId} onValueChange={setSubcategoryId} disabled={!subcategories.length}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {subcategories.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>Vendor / paid to</Label>
                <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Optional" />
              </div>
              <div className="grid gap-1.5">
                <Label>Payment method</Label>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="None" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>None</SelectItem>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m} className="capitalize">
                        {m.replace("_", " ")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label>Payment account</Label>
              <PaymentAccountCombobox value={paymentAccount} onChange={setPaymentAccount} />
            </div>

            <div className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete recurring expense?</AlertDialogTitle>
            <AlertDialogDescription>
              Already-generated expenses stay; no new ones will be created.
            </AlertDialogDescription>
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

export default RecurringExpenses;
