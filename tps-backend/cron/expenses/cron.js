const cron = require("node-cron");
const { generateDueRecurringExpenses } = require("../../service/expense/expenseService");

const runRecurringExpenseSync = async () => {
  try {
    const { generated } = await generateDueRecurringExpenses();
    if (generated > 0) {
      console.log(`💸 Recurring expenses: generated ${generated} expense(s)`);
    }
  } catch (err) {
    console.error("Recurring expense generation failed:", err);
  }
};

// Default ON (no env flag needed) — runs once a day at 01:00. The per-template
// `last_run_date` guard makes a missed/duplicate run harmless.
if (process.env.EXPENSE_RECURRING_CRON_ENABLED !== "false") {
  console.log("🟢 Recurring Expenses Cron Enabled");
  cron.schedule("0 1 * * *", runRecurringExpenseSync);
} else {
  console.log("🔴 Recurring Expenses Cron Disabled by ENV");
}

module.exports = { runRecurringExpenseSync };
