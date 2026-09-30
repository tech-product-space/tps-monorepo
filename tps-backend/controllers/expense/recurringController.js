const {
  RecurringExpense,
  ExpenseCategory,
  ExpenseSubcategory,
  ExpensePaymentAccount,
} = require("../../models");
const { RECURRING_FREQUENCY } = require("../../constants/expenses");
const { generateDueRecurringExpenses } = require("../../service/expense/expenseService");

const include = [
  { model: ExpenseCategory, as: "category", attributes: ["id", "name"] },
  { model: ExpenseSubcategory, as: "subcategory", attributes: ["id", "name"] },
  { model: ExpensePaymentAccount, as: "paymentAccount", attributes: ["id", "name"] },
];

const listRecurring = async (req, res) => {
  try {
    const recurring = await RecurringExpense.findAll({
      include,
      order: [["createdAt", "DESC"]],
    });
    res.status(200).json({ success: true, data: recurring });
  } catch (error) {
    console.error("Error listing recurring expenses:", error);
    res.status(500).json({ error: "Failed to fetch recurring expenses", details: error.message });
  }
};

const createRecurring = async (req, res) => {
  const {
    title,
    amount,
    currency,
    category_id,
    subcategory_id,
    payment_method,
    payment_account_id,
    vendor,
    notes,
    frequency,
    day_of_month,
  } = req.body;

  if (!title || !title.trim()) return res.status(400).json({ error: "'title' is required" });
  if (amount === undefined || isNaN(Number(amount)) || Number(amount) < 0) {
    return res.status(400).json({ error: "'amount' must be a non-negative number" });
  }
  if (!category_id) return res.status(400).json({ error: "'category_id' is required" });

  const day = Number(day_of_month);
  if (!Number.isInteger(day) || day < 1 || day > 28) {
    return res.status(400).json({ error: "'day_of_month' must be an integer between 1 and 28" });
  }

  try {
    const recurring = await RecurringExpense.create({
      title: title.trim(),
      amount,
      currency: currency || "INR",
      category_id,
      subcategory_id: subcategory_id || null,
      payment_method: payment_method || null,
      payment_account_id: payment_account_id || null,
      vendor: vendor || null,
      notes: notes || null,
      frequency: frequency || RECURRING_FREQUENCY.MONTHLY,
      day_of_month: day,
      // Set by requireStaff — the cron generator copies this onto every row it
      // creates, so auto-generated expenses are attributed to this person.
      created_by: req.staff?.id || req.user?.id || req.body.created_by || null,
    });
    res.status(201).json({ success: true, data: recurring });
  } catch (error) {
    console.error("Error creating recurring expense:", error);
    res.status(500).json({ error: "Failed to create recurring expense", details: error.message });
  }
};

const updateRecurring = async (req, res) => {
  const { id } = req.params;
  const fields = [
    "title",
    "amount",
    "currency",
    "category_id",
    "subcategory_id",
    "payment_method",
    "payment_account_id",
    "vendor",
    "notes",
    "frequency",
    "day_of_month",
    "is_active",
  ];

  if (req.body.day_of_month !== undefined) {
    const day = Number(req.body.day_of_month);
    if (!Number.isInteger(day) || day < 1 || day > 28) {
      return res.status(400).json({ error: "'day_of_month' must be an integer between 1 and 28" });
    }
  }

  try {
    const recurring = await RecurringExpense.findByPk(id);
    if (!recurring) return res.status(404).json({ message: "Recurring expense not found" });

    for (const f of fields) {
      if (req.body[f] !== undefined) recurring[f] = req.body[f];
    }
    await recurring.save();
    res.status(200).json({ success: true, data: recurring });
  } catch (error) {
    console.error("Error updating recurring expense:", error);
    res.status(500).json({ error: "Failed to update recurring expense", details: error.message });
  }
};

const toggleRecurring = async (req, res) => {
  try {
    const recurring = await RecurringExpense.findByPk(req.params.id);
    if (!recurring) return res.status(404).json({ message: "Recurring expense not found" });

    recurring.is_active = !recurring.is_active;
    await recurring.save();
    res.status(200).json({ success: true, data: recurring });
  } catch (error) {
    console.error("Error toggling recurring expense:", error);
    res.status(500).json({ error: "Failed to toggle recurring expense", details: error.message });
  }
};

const deleteRecurring = async (req, res) => {
  try {
    const recurring = await RecurringExpense.findByPk(req.params.id);
    if (!recurring) return res.status(404).json({ message: "Recurring expense not found" });

    await recurring.destroy(); // soft delete (paranoid)
    res.status(200).json({ success: true, message: "Recurring expense deleted" });
  } catch (error) {
    console.error("Error deleting recurring expense:", error);
    res.status(500).json({ error: "Failed to delete recurring expense", details: error.message });
  }
};

// Manual trigger to generate today's due recurring expenses — handy for testing
// and for catching up if the cron missed a day.
const runRecurringNow = async (req, res) => {
  try {
    const result = await generateDueRecurringExpenses();
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Error running recurring generation:", error);
    res.status(500).json({ error: "Failed to generate recurring expenses", details: error.message });
  }
};

module.exports = {
  listRecurring,
  createRecurring,
  updateRecurring,
  toggleRecurring,
  deleteRecurring,
  runRecurringNow,
};
