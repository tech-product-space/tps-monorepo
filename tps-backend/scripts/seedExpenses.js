// One-off helper to populate sample expenses for testing the expense tracker.
// Maps to categories/subcategories by NAME (resolved to the real IDs at runtime),
// so it works regardless of which categories exist. Safe to delete afterwards.
//
// Run:  NODE_ENV=development node scripts/seedExpenses.js
"use strict";

const db = require("../models");

const SAMPLES = [
  // March
  ["Office rent – March", 45000, "2026-03-01", "Office & Rent", "Rent", "paid", "bank_transfer", "Prestige Estates"],
  ["Electricity bill", 6800, "2026-03-05", "Office & Rent", "Utility", "paid", "upi", "BESCOM"],
  ["AWS hosting", 12400, "2026-03-10", "Software & Subscriptions", "Cloud Hosting", "paid", "card", "Amazon Web Services"],
  ["Figma team plan", 3200, "2026-03-12", "Software & Subscriptions", "Saas tools", "paid", "card", "Figma"],
  ["Google Ads", 18500, "2026-03-20", "Marketing", "Ads", "paid", "card", "Google"],
  ["Pantry restock", 2150, "2026-03-22", "Others", null, "paid", "cash", "Local Kirana"],
  // April
  ["Office rent – April", 45000, "2026-04-01", "Office & Rent", "Rent", "paid", "bank_transfer", "Prestige Estates"],
  ["Freelance designer", 25000, "2026-04-08", "Salaries & Contractors", "Freelance", "paid", "bank_transfer", "Riya Sharma"],
  ["Domain renewals", 1800, "2026-04-11", "Software & Subscriptions", "Domain", "paid", "card", "GoDaddy"],
  ["Cab to client meeting", 640, "2026-04-15", "Travel", null, "reimbursed", "upi", "Uber"],
  ["LinkedIn ads", 9300, "2026-04-25", "Marketing", "Ads", "paid", "card", "LinkedIn"],
  ["Intern stipend", 12000, "2026-04-28", "Salaries & Contractors", "Intern", "paid", "bank_transfer", "Karan Mehta"],
  // May
  ["Office rent – May", 45000, "2026-05-01", "Office & Rent", "Rent", "paid", "bank_transfer", "Prestige Estates"],
  ["Flight – Delhi event", 7950, "2026-05-06", "Travel", "Flights", "reimbursed", "card", "IndiGo"],
  ["Hotel – Delhi", 5400, "2026-05-07", "Travel", "Hotels", "reimbursed", "card", "Treebo"],
  ["Notion subscription", 1500, "2026-05-12", "Software & Subscriptions", "Saas tools", "paid", "card", "Notion"],
  ["Webinar promotion", 8200, "2026-05-18", "Marketing", "Events", "paid", "card", "Meta"],
  ["AC servicing", 2600, "2026-05-24", "Office & Rent", "Maintanance", "paid", "upi", "CoolCare"],
  // June
  ["Office rent – June", 45000, "2026-06-01", "Office & Rent", "Rent", "pending", "bank_transfer", "Prestige Estates"],
  ["AWS hosting – June", 13100, "2026-06-10", "Software & Subscriptions", "Cloud Hosting", "pending", "card", "Amazon Web Services"],
  ["Content writer", 15000, "2026-06-12", "Marketing", "Content", "pending", "bank_transfer", "Aman Verma"],
];

const MARKER = "[sample]";

(async () => {
  try {
    // Resolve category + subcategory names -> ids.
    const cats = await db.ExpenseCategory.findAll({
      include: [{ model: db.ExpenseSubcategory, as: "subcategories" }],
    });
    const catByName = new Map();
    const subByCatAndName = new Map();
    for (const c of cats) {
      catByName.set(c.name.toLowerCase(), c.id);
      for (const s of c.subcategories || []) {
        subByCatAndName.set(`${c.name.toLowerCase()}|${s.name.toLowerCase()}`, s.id);
      }
    }

    // Pick the superadmin as the creator if present.
    const creator = await db.company.findOne({ where: { role: "superadmin" } });
    const createdBy = creator ? creator.id : null;

    // Idempotency guard — don't double-insert on re-run.
    const already = await db.Expense.count({ where: { notes: MARKER } });
    if (already > 0) {
      console.log(`Sample expenses already present (${already}). Nothing to do.`);
      process.exit(0);
    }

    const rows = [];
    const skipped = [];
    for (const [title, amount, date, catName, subName, status, pay, vendor] of SAMPLES) {
      const category_id = catByName.get(catName.toLowerCase());
      if (!category_id) {
        skipped.push(`${title} (no category "${catName}")`);
        continue;
      }
      const subcategory_id = subName
        ? subByCatAndName.get(`${catName.toLowerCase()}|${subName.toLowerCase()}`) || null
        : null;
      rows.push({
        title,
        amount,
        currency: "INR",
        expense_date: date,
        category_id,
        subcategory_id,
        status,
        payment_method: pay,
        vendor,
        notes: MARKER,
        created_by: createdBy,
      });
    }

    await db.Expense.bulkCreate(rows);
    console.log(`Inserted ${rows.length} sample expenses.`);
    if (skipped.length) console.log("Skipped:\n - " + skipped.join("\n - "));
    process.exit(0);
  } catch (e) {
    console.error("Seed failed:", e.message);
    process.exit(1);
  }
})();
