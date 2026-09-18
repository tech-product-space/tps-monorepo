const csv = require("csv-parser");
const { Readable } = require("stream");
const { ulid } = require("ulid");
const {
  Expense,
  ExpenseCategory,
  ExpenseSubcategory,
  ExpenseTeam,
  ExpensePaymentAccount,
  sequelize,
} = require("../../models");
const {
  EXPENSE_STATUS,
  EXPENSE_SOURCE,
  PAYMENT_METHOD,
  CURRENCY_CODES,
  DEFAULT_CURRENCY,
} = require("../../constants/expenses");
// Hard ceiling per upload. Anything bigger is a whole-file rejection rather than
// a slow request that half-succeeds.
const MAX_ROWS = 1000;

// Canonical column order — also the header of the failed-rows file the admin
// downloads, so a fixed file can be re-uploaded as-is.
const COLUMNS = [
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
];

const REQUIRED_COLUMNS = ["title", "amount", "expense_date", "category"];

/**
 * Normalize a CSV header into one of COLUMNS.
 * Handles the BOM Excel prepends, the "*" the template puts on required columns,
 * stray casing, and spaces where the template uses underscores.
 */
function normalizeHeader(header) {
  return String(header || "")
    .replace(/^﻿/, "")
    .trim()
    .replace(/\*+$/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

const clean = (value) => String(value ?? "").trim();

/** "₹ 1,20,000.50" -> 120000.5 ; returns null when not a usable number. */
function parseAmount(raw) {
  const stripped = clean(raw).replace(/[^0-9.-]/g, "");
  if (!stripped) return null;
  const n = Number(stripped);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

/**
 * Strict YYYY-MM-DD. Ambiguous formats like 01/07/2026 are rejected rather than
 * guessed at, and the round-trip check kills impossible dates (2026-02-31).
 */
function parseDate(raw) {
  const value = clean(raw);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10) === value ? value : null;
}

/** "Bank Transfer" / "bank_transfer" -> "bank_transfer" */
function parsePaymentMethod(raw) {
  const key = clean(raw).toLowerCase().replace(/[\s-]+/g, "_");
  if (!key) return { value: null };
  const match = Object.values(PAYMENT_METHOD).find((m) => m === key);
  return match ? { value: match } : { error: true };
}

function parseStatus(raw) {
  const key = clean(raw).toLowerCase();
  if (!key) return { value: EXPENSE_STATUS.PAID };
  const match = Object.values(EXPENSE_STATUS).find((s) => s === key);
  return match ? { value: match } : { error: true };
}

function parseCurrency(raw) {
  const key = clean(raw).toUpperCase();
  if (!key) return { value: DEFAULT_CURRENCY };
  return CURRENCY_CODES.includes(key) ? { value: key } : { error: true };
}

/** Case-insensitive name -> id maps, active records only. Four queries total. */
async function loadLookups() {
  const [categories, subcategories, teams, accounts] = await Promise.all([
    ExpenseCategory.findAll({ where: { is_active: true }, attributes: ["id", "name"], raw: true }),
    ExpenseSubcategory.findAll({
      where: { is_active: true },
      attributes: ["id", "name", "category_id"],
      raw: true,
    }),
    ExpenseTeam.findAll({ where: { is_active: true }, attributes: ["id", "name"], raw: true }),
    ExpensePaymentAccount.findAll({
      where: { is_active: true },
      attributes: ["id", "name"],
      raw: true,
    }),
  ]);

  return {
    categoryByName: new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id])),
    // Keyed by category so a subcategory can't be borrowed across categories.
    subcategoryByKey: new Map(
      subcategories.map((s) => [`${s.category_id}|${s.name.trim().toLowerCase()}`, s.id])
    ),
    teamByName: new Map(teams.map((t) => [t.name.trim().toLowerCase(), t.id])),
    accountByName: new Map(accounts.map((a) => [a.name.trim().toLowerCase(), a.id])),
  };
}

/**
 * Validate one CSV row into an Expense payload.
 * Returns `{ values }` or `{ errors: [{ column, message }] }` — all problems in
 * the row are collected, not just the first, so one round-trip fixes everything.
 */
function validateRow(row, lookups) {
  const errors = [];

  const title = clean(row.title);
  if (!title) errors.push({ column: "title", message: "Title is required" });
  else if (title.length > 255) {
    errors.push({ column: "title", message: "Title must be 255 characters or fewer" });
  }

  const amount = parseAmount(row.amount);
  if (amount === null) {
    errors.push({ column: "amount", message: "Amount must be a number, e.g. 2199 or 4250.50" });
  } else if (amount < 0) {
    errors.push({ column: "amount", message: "Amount cannot be negative" });
  }

  const currency = parseCurrency(row.currency);
  if (currency.error) {
    errors.push({
      column: "currency",
      message: `Currency must be one of ${CURRENCY_CODES.join(", ")}`,
    });
  }

  const expenseDate = parseDate(row.expense_date);
  if (!expenseDate) {
    errors.push({ column: "expense_date", message: "Date must be a real date in YYYY-MM-DD format" });
  }

  const categoryName = clean(row.category);
  let categoryId = null;
  if (!categoryName) {
    errors.push({ column: "category", message: "Category is required" });
  } else {
    categoryId = lookups.categoryByName.get(categoryName.toLowerCase()) || null;
    if (!categoryId) {
      errors.push({
        column: "category",
        message: `No active category named "${categoryName}" — create it first under Categories`,
      });
    }
  }

  const subcategoryName = clean(row.subcategory);
  let subcategoryId = null;
  if (subcategoryName && categoryId) {
    subcategoryId =
      lookups.subcategoryByKey.get(`${categoryId}|${subcategoryName.toLowerCase()}`) || null;
    if (!subcategoryId) {
      errors.push({
        column: "subcategory",
        message: `"${subcategoryName}" is not an active subcategory of "${categoryName}"`,
      });
    }
  }

  const status = parseStatus(row.status);
  if (status.error) {
    errors.push({ column: "status", message: "Status must be Paid, Pending or Reimbursed" });
  }

  const paymentMethod = parsePaymentMethod(row.payment_method);
  if (paymentMethod.error) {
    errors.push({
      column: "payment_method",
      message: "Payment method must be Cash, Card, Bank Transfer, UPI or Other",
    });
  }

  // Unlike category/team, an unknown account is NOT an error — it gets created.
  // The name is carried through and resolved to an id after validation, so only
  // rows that are otherwise valid can mint a new account.
  const accountName = clean(row.payment_account);
  if (accountName.length > 255) {
    errors.push({
      column: "payment_account",
      message: "Payment account must be 255 characters or fewer",
    });
  }

  const vendor = clean(row.vendor);
  if (vendor.length > 255) {
    errors.push({ column: "vendor", message: "Vendor must be 255 characters or fewer" });
  }

  const teamName = clean(row.team);
  let teamId = null;
  if (teamName) {
    teamId = lookups.teamByName.get(teamName.toLowerCase()) || null;
    if (!teamId) {
      errors.push({
        column: "team",
        message: `No active team named "${teamName}" — create it first under Teams`,
      });
    }
  }

  if (errors.length) return { errors };

  return {
    values: {
      title,
      amount,
      currency: currency.value,
      expense_date: expenseDate,
      category_id: categoryId,
      subcategory_id: subcategoryId,
      status: status.value,
      payment_method: paymentMethod.value,
      // Resolved to payment_account_id by the caller, creating if needed.
      payment_account_name: accountName || null,
      vendor: vendor || null,
      team_id: teamId,
      notes: clean(row.notes) || null,
    },
  };
}

/**
 * Parse, validate and insert a bulk-expense CSV.
 *
 * Partial by design: every valid row is committed in a single transaction and
 * every invalid row is skipped and handed back with its ORIGINAL cells, so the
 * admin can download just the failures, fix them, and re-upload. Nothing about a
 * failed row is persisted.
 *
 * @param {Buffer} buffer - the uploaded file (multer memory storage)
 * @param {{ createdBy: number|null }} options
 * @returns {Promise<{ fileError?: string, totalRows: number, imported: number,
 *   failed: number, errors: Array<{ row: number, original: object,
 *   errors: Array<{ column: string, message: string }> }> }>}
 */
async function importExpensesFromCsv(buffer, { createdBy = null } = {}) {
  const rows = [];
  let headers = null;

  const stream = Readable.from(buffer).pipe(
    csv({ mapHeaders: ({ header }) => normalizeHeader(header) })
  );
  stream.on("headers", (h) => {
    headers = h;
  });

  for await (const row of stream) {
    // Skip fully blank lines — trailing newlines in exported sheets are common.
    if (COLUMNS.every((c) => !clean(row[c]))) continue;
    rows.push(row);
    if (rows.length > MAX_ROWS) {
      return {
        fileError: `This file has more than ${MAX_ROWS} rows. Split it into smaller files and upload them one at a time.`,
        totalRows: 0,
        imported: 0,
        failed: 0,
        errors: [],
      };
    }
  }

  const missing = REQUIRED_COLUMNS.filter((c) => !(headers || []).includes(c));
  if (missing.length) {
    return {
      fileError: `Missing required column(s): ${missing.join(", ")}. Download the template and keep its header row.`,
      totalRows: 0,
      imported: 0,
      failed: 0,
      errors: [],
    };
  }

  if (!rows.length) {
    return {
      fileError: "The file has no data rows.",
      totalRows: 0,
      imported: 0,
      failed: 0,
      errors: [],
    };
  }

  const lookups = await loadLookups();

  const toInsert = [];
  const errors = [];

  rows.forEach((row, i) => {
    const result = validateRow(row, lookups);
    if (result.errors) {
      errors.push({
        // +2: one for the header line, one because spreadsheets are 1-indexed —
        // this is the line number the admin sees in Excel.
        row: i + 2,
        original: Object.fromEntries(COLUMNS.map((c) => [c, clean(row[c])])),
        errors: result.errors,
      });
      return;
    }
    toInsert.push({
      id: ulid(),
      ...result.values,
      source: EXPENSE_SOURCE.INTERNAL,
      created_by: createdBy,
    });
  });

  // Mint any payment account the file references but the list doesn't have yet.
  // Only importable rows are considered, so a typo on a row that fails for some
  // other reason never creates one. Names repeated across rows (in any casing)
  // collapse into a single new account.
  const createdAccounts = [];
  const newNames = new Map(); // lowercased -> first spelling seen
  for (const r of toInsert) {
    const name = r.payment_account_name;
    if (!name) continue;
    const key = name.toLowerCase();
    if (lookups.accountByName.has(key) || newNames.has(key)) continue;
    newNames.set(key, name);
  }

  const newAccounts = [...newNames.entries()].map(([key, name]) => ({
    key,
    id: ulid(),
    name,
  }));

  if (toInsert.length) {
    // One transaction for both: if the expense insert fails, the accounts it
    // would have introduced roll back with it.
    await sequelize.transaction(async (transaction) => {
      if (newAccounts.length) {
        await ExpensePaymentAccount.bulkCreate(
          newAccounts.map((a) => ({
            id: a.id,
            name: a.name,
            is_active: true,
            created_by: createdBy,
          })),
          { transaction }
        );
        for (const a of newAccounts) {
          lookups.accountByName.set(a.key, a.id);
          createdAccounts.push(a.name);
        }
      }

      for (const r of toInsert) {
        r.payment_account_id = r.payment_account_name
          ? lookups.accountByName.get(r.payment_account_name.toLowerCase()) || null
          : null;
        delete r.payment_account_name;
      }

      await Expense.bulkCreate(toInsert, { transaction });
    });
  }

  return {
    totalRows: rows.length,
    imported: toInsert.length,
    failed: errors.length,
    // Surfaced in the import dialog so a typo'd account doesn't quietly become a
    // permanent option nobody notices.
    createdAccounts,
    errors,
  };
}

module.exports = {
  importExpensesFromCsv,
  // exported for reuse by the template/rules endpoints and tests
  COLUMNS,
  MAX_ROWS,
  normalizeHeader,
};
