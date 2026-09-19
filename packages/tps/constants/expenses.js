const EXPENSE_STATUS = Object.freeze({
  PAID: "paid", // money already went out
  PENDING: "pending", // logged but not yet paid (also default for auto-generated recurring rows)
  REIMBURSED: "reimbursed", // an employee was paid back
});

const PAYMENT_METHOD = Object.freeze({
  CASH: "cash",
  CARD: "card",
  BANK_TRANSFER: "bank_transfer",
  UPI: "upi",
  OTHER: "other",
});

const RECURRING_FREQUENCY = Object.freeze({
  MONTHLY: "monthly", // only supported cadence in v1
});

// Where an expense row came from. External rows are created by the public
// submission forms; internal rows are logged by staff in the admin panel.
const EXPENSE_SOURCE = Object.freeze({
  INTERNAL: "internal",
  EXTERNAL: "external",
});

// Currencies an expense can be recorded in. Amounts are NEVER converted between
// currencies — each row is stored and displayed in its own currency, and the
// dashboard aggregates one currency at a time.
const SUPPORTED_CURRENCIES = Object.freeze([
  { code: "INR", symbol: "₹", label: "Indian Rupee" },
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "British Pound" },
  { code: "AED", symbol: "د.إ", label: "UAE Dirham" },
]);

const CURRENCY_CODES = Object.freeze(SUPPORTED_CURRENCIES.map((c) => c.code));
const DEFAULT_CURRENCY = "INR";

// Configurable public-form fields, in display order. Core fields (title,
// amount, category, date) are always present and are NOT listed here.
const FORM_FIELDS = Object.freeze([
  "name",
  "email",
  "phone",
  "payment_method",
  "payment_account",
  "vendor",
  "receipt",
  "notes",
]);

// Default per-field config applied when a form has no explicit field_config.
const DEFAULT_FIELD_CONFIG = Object.freeze({
  name: { enabled: true, required: true },
  email: { enabled: true, required: true },
  phone: { enabled: true, required: false },
  payment_method: { enabled: true, required: false },
  // Off by default: external submitters usually don't know which company
  // account paid — finance sets it while reconciling.
  payment_account: { enabled: false, required: false },
  vendor: { enabled: true, required: true },
  receipt: { enabled: true, required: false },
  notes: { enabled: true, required: false },
});

module.exports = {
  EXPENSE_STATUS,
  PAYMENT_METHOD,
  RECURRING_FREQUENCY,
  EXPENSE_SOURCE,
  SUPPORTED_CURRENCIES,
  CURRENCY_CODES,
  DEFAULT_CURRENCY,
  FORM_FIELDS,
  DEFAULT_FIELD_CONFIG,
};
