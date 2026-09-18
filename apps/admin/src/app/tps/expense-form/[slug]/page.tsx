"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { z } from "zod";
import {
  getPublicForm,
  submitExpense,
  uploadFormReceipt,
  type PublicFormConfig,
} from "@/services/expenses/publicExpenseFormService";
import { resolveAttachment, currencySymbol } from "@/components/Pages/Common/Expenses/expenseUtils";
import { CurrencySelect } from "@/components/Pages/Common/Expenses/CurrencySelect";

// Validation schema, derived from the form's field_config: a field is required
// only when it's both enabled and marked required by the admin.
const buildSchema = (config: PublicFormConfig) => {
  const fc = config.field_config;
  const reqStr = (msg: string) => z.string().trim().min(1, msg);
  const optStr = z.string().optional();
  const req = (key: keyof typeof fc) => fc[key].enabled && fc[key].required;

  return z.object({
    title: reqStr("Please enter what the expense is for."),
    amount: z
      .string()
      .refine((v) => !!v && !isNaN(Number(v)) && Number(v) > 0, "Please enter a valid amount."),
    category_id: z.string().min(1, "Please select a category."),
    submitter_name: req("name") ? reqStr("Please enter your name.") : optStr,
    submitter_email: req("email")
      ? z.string().trim().email("Please enter a valid email.")
      : z
          .string()
          .optional()
          .refine((v) => !v || z.string().email().safeParse(v).success, "Please enter a valid email."),
    submitter_phone: req("phone") ? reqStr("Please enter your phone number.") : optStr,
    payment_method: req("payment_method") ? reqStr("Please select a payment mode.") : optStr,
    payment_account_id: req("payment_account")
      ? reqStr("Please select a payment account.")
      : optStr,
    vendor: req("vendor") ? reqStr("Please enter the vendor.") : optStr,
    notes: req("notes") ? reqStr("Please add notes.") : optStr,
    receipt_url: req("receipt")
      ? z.string().min(1, "Please attach a receipt.")
      : z.string().nullable().optional(),
  });
};

const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "upi", "other"];
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function ExpenseFormPage() {
  const params = useParams();
  const slug = String(params?.slug || "");

  const [config, setConfig] = useState<PublicFormConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  // form fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [date, setDate] = useState(todayStr());
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [website, setWebsite] = useState(""); // honeypot

  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    getPublicForm(slug)
      .then(setConfig)
      .catch((e) => {
        // Surface the real reason: a 404 means the form is inactive/missing;
        // anything else (network/CORS/backend down) shows status or message so
        // it can be diagnosed instead of always reading "unavailable".
        const status = e?.response?.status;
        if (status === 404) setLoadError("This form is no longer available.");
        else if (e?.response?.data?.error) setLoadError(e.response.data.error);
        else setLoadError(`Couldn't reach the server (${e?.message || "network error"}).`);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const subcategories = useMemo(
    () => config?.categories.find((c) => c.id === categoryId)?.subcategories ?? [],
    [config, categoryId]
  );

  const handleReceipt = async (file?: File) => {
    if (!file) return;
    try {
      setUploading(true);
      setError(null);
      const { key } = await uploadFormReceipt(slug, file);
      setReceiptUrl(key); // store the S3 key; resolved to a URL for display
    } catch (e: any) {
      setError(e?.response?.data?.error || "Failed to upload receipt.");
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!config) return;
    setError(null);

    const parsed = buildSchema(config).safeParse({
      title,
      amount,
      category_id: categoryId,
      submitter_name: name,
      submitter_email: email,
      submitter_phone: phone,
      payment_method: paymentMethod,
      payment_account_id: paymentAccountId,
      vendor,
      notes,
      receipt_url: receiptUrl ?? "",
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }

    try {
      setSubmitting(true);
      await submitExpense(slug, {
        title: title.trim(),
        amount,
        currency,
        expense_date: date,
        category_id: categoryId,
        subcategory_id: subcategoryId || null,
        payment_method: paymentMethod || null,
        payment_account_id: paymentAccountId || null,
        vendor: vendor.trim() || null,
        notes: notes.trim() || null,
        receipt_url: receiptUrl,
        submitter_name: name.trim() || null,
        submitter_email: email.trim() || null,
        submitter_phone: phone.trim() || null,
        website,
      });
      setSubmitted(true);
    } catch (e: any) {
      setError(e?.response?.data?.error || "Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-300 border-t-gray-700" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-xl shadow p-8 max-w-md text-center">
          <h1 className="text-lg font-semibold text-gray-900">Form unavailable</h1>
          <p className="mt-2 text-gray-500 text-sm">{loadError}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white rounded-xl shadow p-8 max-w-md text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-2xl">
            ✓
          </div>
          <h1 className="text-lg font-semibold text-gray-900">Expense submitted</h1>
          <p className="mt-2 text-gray-500 text-sm">
            Thanks{name ? `, ${name}` : ""}! Your expense has been recorded.
          </p>
          <button
            onClick={() => {
              setSubmitted(false);
              setTitle("");
              setAmount("");
              setVendor("");
              setNotes("");
              setReceiptUrl(null);
              setSubcategoryId("");
            }}
            className="mt-6 text-sm font-medium text-blue-600 hover:underline"
          >
            Submit another
          </button>
        </div>
      </div>
    );
  }

  if (!config) return null;

  const labelCls = "block text-sm font-medium text-gray-700 mb-1";
  const inputCls =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900";

  const fc = config.field_config;
  const star = (k: keyof typeof fc) => (fc[k].required ? " *" : "");

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="mx-auto max-w-lg">
        <div className="bg-white rounded-xl shadow">
          <div className="border-b px-6 py-5">
            <h1 className="text-xl font-semibold text-gray-900">{config?.name}</h1>
            {config?.team && <p className="text-sm text-gray-500 mt-0.5">{config.team}</p>}
            {config?.instructions && (
              <p className="text-sm text-gray-600 mt-3 whitespace-pre-line">{config.instructions}</p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {/* Honeypot — visually hidden, ignored by humans */}
            <input
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="hidden"
              aria-hidden="true"
            />

            {(fc.name.enabled || fc.email.enabled) && (
              <div className={fc.name.enabled && fc.email.enabled ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : ""}>
                {fc.name.enabled && (
                  <div>
                    <label className={labelCls}>Your name{star("name")}</label>
                    <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                )}
                {fc.email.enabled && (
                  <div>
                    <label className={labelCls}>Email{star("email")}</label>
                    <input
                      type="email"
                      className={inputCls}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}
            {fc.phone.enabled && (
              <div>
                <label className={labelCls}>Phone{star("phone")}</label>
                <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            )}

            <div>
              <label className={labelCls}>What is this expense for? *</label>
              <input
                className={inputCls}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Client lunch"
              />
            </div>

            <div className="grid grid-cols-[auto_1fr] gap-3 sm:grid-cols-[auto_1fr_1fr]">
              <div className="flex flex-col">
                <label className={labelCls}>Currency</label>
                <CurrencySelect
                  value={currency}
                  onValueChange={setCurrency}
                  className="h-[38px] border-gray-300"
                />
              </div>
              <div>
                <label className={labelCls}>Amount ({currencySymbol(currency)}) *</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={inputCls}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className={labelCls}>Date</label>
                <input
                  type="date"
                  className={inputCls}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Category *</label>
                <select
                  className={inputCls}
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    setSubcategoryId("");
                  }}
                >
                  <option value="">Select</option>
                  {config?.categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Subcategory</label>
                <select
                  className={inputCls}
                  value={subcategoryId}
                  onChange={(e) => setSubcategoryId(e.target.value)}
                  disabled={!subcategories.length}
                >
                  <option value="">{subcategories.length ? "None" : "—"}</option>
                  {subcategories.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {(fc.payment_method.enabled || fc.vendor.enabled) && (
              <div className={fc.payment_method.enabled && fc.vendor.enabled ? "grid grid-cols-1 sm:grid-cols-2 gap-3" : ""}>
                {fc.payment_method.enabled && (
                  <div>
                    <label className={labelCls}>Payment mode{star("payment_method")}</label>
                    <select
                      className={inputCls}
                      value={paymentMethod}
                      onChange={(e) => setPaymentMethod(e.target.value)}
                    >
                      <option value="">None</option>
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m} className="capitalize">
                          {m.replace("_", " ")}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {fc.vendor.enabled && (
                  <div>
                    <label className={labelCls}>Paid to / vendor{star("vendor")}</label>
                    <input className={inputCls} value={vendor} onChange={(e) => setVendor(e.target.value)} />
                  </div>
                )}
              </div>
            )}

            {fc.payment_account.enabled && (
              <div>
                <label className={labelCls}>Payment account{star("payment_account")}</label>
                <select
                  className={inputCls}
                  value={paymentAccountId}
                  onChange={(e) => setPaymentAccountId(e.target.value)}
                >
                  <option value="">None</option>
                  {(config.paymentAccounts || []).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {fc.notes.enabled && (
              <div>
                <label className={labelCls}>Notes{star("notes")}</label>
                <textarea
                  className={inputCls}
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            )}

            {fc.receipt.enabled && (
            <div>
              <label className={labelCls}>
                Receipt {fc.receipt.required ? "*" : "(optional)"}
              </label>
              {receiptUrl ? (
                <div className="flex items-center gap-3 text-sm">
                  <a
                    href={resolveAttachment(receiptUrl)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline"
                  >
                    View uploaded receipt
                  </a>
                  <button
                    type="button"
                    onClick={() => setReceiptUrl(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => handleReceipt(e.target.files?.[0])}
                  className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-md file:border-0 file:bg-gray-900 file:px-3 file:py-2 file:text-white"
                />
              )}
              {uploading && <p className="text-xs text-gray-500 mt-1">Uploading…</p>}
            </div>
            )}

            {error && (
              <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}

            <button
              type="submit"
              disabled={submitting || uploading}
              className="w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit expense"}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">Powered by The Product Space</p>
      </div>
    </div>
  );
}
