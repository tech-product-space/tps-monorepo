"use client";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createExpense,
  updateExpense,
  uploadReceipt,
  type Expense,
  type ExpenseCategory,
  type ExpenseStatus,
} from "@/services/expenses/expensesService";
import { resolveAttachment, currencySymbol } from "./expenseUtils";
import { CurrencySelect } from "./CurrencySelect";
import { PaymentAccountCombobox } from "./PaymentAccountCombobox";

const STATUSES: ExpenseStatus[] = ["paid", "pending", "reimbursed"];
const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "upi", "other"];
const NONE = "__none__";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: ExpenseCategory[];
  expense?: Expense | null; // present => edit mode
  onSaved: () => void;
}

const todayStr = () => new Date().toISOString().slice(0, 10);

const ExpenseFormDialog = ({ open, onOpenChange, categories, expense, onSaved }: Props) => {
  const isEdit = !!expense;

  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [expenseDate, setExpenseDate] = useState(todayStr());
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState<string>(NONE);
  const [status, setStatus] = useState<ExpenseStatus>("paid");
  const [paymentMethod, setPaymentMethod] = useState<string>(NONE);
  const [paymentAccount, setPaymentAccount] = useState<string | null>(null);
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(expense?.title ?? "");
    setAmount(expense?.amount ?? "");
    setCurrency(expense?.currency ?? "INR");
    setExpenseDate(expense?.expense_date ?? todayStr());
    setCategoryId(expense?.category_id ?? "");
    setSubcategoryId(expense?.subcategory_id ?? NONE);
    setStatus(expense?.status ?? "paid");
    setPaymentMethod(expense?.payment_method ?? NONE);
    setPaymentAccount(expense?.payment_account_id ?? null);
    setVendor(expense?.vendor ?? "");
    setNotes(expense?.notes ?? "");
    setReceiptUrl(expense?.receipt_url ?? null);
  }, [open, expense]);

  const subcategories = useMemo(
    () => categories.find((c) => c.id === categoryId)?.subcategories ?? [],
    [categories, categoryId]
  );

  const handleReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploading(true);
      const { key } = await uploadReceipt(file);
      setReceiptUrl(key); // store the S3 key; resolved to a URL for display
      toast.success("Receipt uploaded");
    } catch {
      toast.error("Failed to upload receipt");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!title.trim()) return toast.error("Title is required");
    if (!amount || isNaN(Number(amount)) || Number(amount) < 0)
      return toast.error("Enter a valid amount");
    if (!categoryId) return toast.error("Select a category");

    const payload = {
      title: title.trim(),
      amount,
      currency,
      expense_date: expenseDate,
      category_id: categoryId,
      subcategory_id: subcategoryId === NONE ? null : subcategoryId,
      status,
      payment_method: paymentMethod === NONE ? null : paymentMethod,
      payment_account_id: paymentAccount,
      vendor: vendor.trim() || null,
      notes: notes.trim() || null,
      receipt_url: receiptUrl,
    };

    try {
      setSaving(true);
      if (isEdit && expense) {
        await updateExpense(expense.id, payload);
        toast.success("Expense updated");
      } else {
        await createExpense(payload);
        toast.success("Expense added");
      }
      onSaved();
      onOpenChange(false);
    } catch {
      toast.error("Failed to save expense");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit expense" : "Add expense"}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-1.5">
            <Label>Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. AWS subscription" />
          </div>

          <div className="grid grid-cols-[auto_1fr_1fr] gap-3">
            <div className="grid gap-1.5">
              <Label>Currency</Label>
              <CurrencySelect value={currency} onValueChange={setCurrency} />
            </div>
            <div className="grid gap-1.5">
              <Label>Amount ({currencySymbol(currency)})</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Date</Label>
              <Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
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
              <Label>Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as ExpenseStatus)}>
                <SelectTrigger className="w-full">
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

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>Payment account</Label>
              <PaymentAccountCombobox value={paymentAccount} onChange={setPaymentAccount} />
            </div>
            <div className="grid gap-1.5">
              <Label>Vendor / paid to</Label>
              <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="Optional" />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" rows={2} />
          </div>

          <div className="grid gap-1.5">
            <Label>Receipt</Label>
            {receiptUrl ? (
              <div className="flex items-center gap-3 text-sm">
                <a href={resolveAttachment(receiptUrl)} target="_blank" rel="noreferrer" className="text-blue-600 underline truncate max-w-[260px]">
                  View receipt
                </a>
                <button type="button" onClick={() => setReceiptUrl(null)} className="text-gray-400 hover:text-gray-600">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer border rounded-md px-3 py-2 w-fit hover:bg-gray-50">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "Uploading..." : "Upload receipt"}
                <input type="file" className="hidden" onChange={handleReceipt} accept="image/*,application/pdf" />
              </label>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={saving || uploading}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isEdit ? "Save changes" : "Add expense"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExpenseFormDialog;
