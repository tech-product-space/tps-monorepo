const psEnv = require("@ps/env/tps");
const { Op } = require("sequelize");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3 = require("../../config/aws");
const {
  Expense,
  ExpenseCategory,
  ExpenseSubcategory,
  ExpenseTeam,
  ExpensePaymentAccount,
  ExpenseForm,
  company,
} = require("../../models");
const { getPaginationParams, getMeta } = require("../../utils/pagination");
const { EXPENSE_STATUS } = require("../../constants/expenses");
const {
  buildExpenseWhere,
  getSummary,
  getTotalsByCurrency,
} = require("../../service/expense/expenseService");
const { importExpensesFromCsv } = require("../../service/expense/expenseImportService");

const categoryInclude = [
  { model: ExpenseCategory, as: "category", attributes: ["id", "name"] },
  { model: ExpenseSubcategory, as: "subcategory", attributes: ["id", "name"] },
  { model: ExpenseTeam, as: "team", attributes: ["id", "name"] },
  { model: ExpensePaymentAccount, as: "paymentAccount", attributes: ["id", "name"] },
  { model: company, as: "creator", attributes: ["id", "name", "email"] },
];

// Same relations as the list, plus the originating public form — only the export
// shows it, so the list query stays one join lighter.
const exportInclude = [
  ...categoryInclude,
  { model: ExpenseForm, as: "form", attributes: ["id", "name"] },
];

// Hard ceiling on a single export so one request can't pull the whole table into
// memory. Anything beyond it needs a narrower date range.
const EXPORT_ROW_CAP = 20000;

// Widen the shared filter's search to the joined columns (staff creator, payment
// account). Kept out of buildExpenseWhere because `$creator.*$` only resolves on
// queries that actually include those relations.
const addJoinedSearch = (where, search) => {
  if (!search || !search.trim() || !where[Op.or]) return where;
  const q = `%${search.trim()}%`;
  where[Op.or].push(
    { "$creator.name$": { [Op.iLike]: q } },
    { "$creator.email$": { [Op.iLike]: q } },
    { "$paymentAccount.name$": { [Op.iLike]: q } }
  );
  return where;
};

const listExpenses = async (req, res) => {
  try {
    const { page, limit, offset } = getPaginationParams(req.query, 20, 100);
    const where = addJoinedSearch(buildExpenseWhere(req.query), req.query.search);

    const { count, rows } = await Expense.findAndCountAll({
      where,
      include: categoryInclude,
      order: [["expense_date", "DESC"], ["createdAt", "DESC"]],
      limit,
      offset,
      distinct: true,
      subQuery: false, // needed so the $creator.*$ search columns resolve
    });

    res.status(200).json({
      success: true,
      meta: getMeta(count, page, limit),
      data: rows,
    });
  } catch (error) {
    console.error("Error listing expenses:", error);
    res.status(500).json({ error: "Failed to fetch expenses", details: error.message });
  }
};

const getExpenseById = async (req, res) => {
  try {
    const expense = await Expense.findByPk(req.params.id, { include: categoryInclude });
    if (!expense) return res.status(404).json({ message: "Expense not found" });
    res.status(200).json({ success: true, data: expense });
  } catch (error) {
    console.error("Error fetching expense:", error);
    res.status(500).json({ error: "Failed to fetch expense", details: error.message });
  }
};

const createExpense = async (req, res) => {
  const {
    title,
    amount,
    currency,
    expense_date,
    category_id,
    subcategory_id,
    status,
    payment_method,
    payment_account_id,
    vendor,
    notes,
    receipt_url,
  } = req.body;

  if (!title || !title.trim()) return res.status(400).json({ error: "'title' is required" });
  if (amount === undefined || isNaN(Number(amount)) || Number(amount) < 0) {
    return res.status(400).json({ error: "'amount' must be a non-negative number" });
  }
  if (!category_id) return res.status(400).json({ error: "'category_id' is required" });
  if (status && !Object.values(EXPENSE_STATUS).includes(status)) {
    return res.status(400).json({ error: "Invalid 'status'" });
  }

  try {
    const expense = await Expense.create({
      title: title.trim(),
      amount,
      currency: currency || "INR",
      expense_date: expense_date || new Date().toISOString().slice(0, 10),
      category_id,
      subcategory_id: subcategory_id || null,
      status: status || EXPENSE_STATUS.PAID,
      payment_method: payment_method || null,
      payment_account_id: payment_account_id || null,
      vendor: vendor || null,
      notes: notes || null,
      receipt_url: receipt_url || null,
      // Stamp the logged-in staff member (set by requireStaff) so the list's
      // "Added by" column and creator-name search resolve to a real person.
      created_by: req.staff?.id || req.user?.id || req.body.created_by || null,
    });

    const withRelations = await Expense.findByPk(expense.id, { include: categoryInclude });
    res.status(201).json({ success: true, data: withRelations });
  } catch (error) {
    console.error("Error creating expense:", error);
    res.status(500).json({ error: "Failed to create expense", details: error.message });
  }
};

const updateExpense = async (req, res) => {
  const { id } = req.params;
  const {
    title,
    amount,
    currency,
    expense_date,
    category_id,
    subcategory_id,
    status,
    payment_method,
    payment_account_id,
    vendor,
    notes,
    receipt_url,
  } = req.body;

  if (status && !Object.values(EXPENSE_STATUS).includes(status)) {
    return res.status(400).json({ error: "Invalid 'status'" });
  }

  try {
    const expense = await Expense.findByPk(id);
    if (!expense) return res.status(404).json({ message: "Expense not found" });

    if (title !== undefined) expense.title = title.trim();
    if (amount !== undefined) expense.amount = amount;
    if (currency !== undefined) expense.currency = currency;
    if (expense_date !== undefined) expense.expense_date = expense_date;
    if (category_id !== undefined) expense.category_id = category_id;
    if (subcategory_id !== undefined) expense.subcategory_id = subcategory_id || null;
    if (status !== undefined) expense.status = status;
    if (payment_method !== undefined) expense.payment_method = payment_method;
    if (payment_account_id !== undefined) expense.payment_account_id = payment_account_id || null;
    if (vendor !== undefined) expense.vendor = vendor;
    if (notes !== undefined) expense.notes = notes;
    if (receipt_url !== undefined) expense.receipt_url = receipt_url;
    await expense.save();

    const withRelations = await Expense.findByPk(id, { include: categoryInclude });
    res.status(200).json({ success: true, data: withRelations });
  } catch (error) {
    console.error("Error updating expense:", error);
    res.status(500).json({ error: "Failed to update expense", details: error.message });
  }
};

const setExpenseStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status || !Object.values(EXPENSE_STATUS).includes(status)) {
    return res.status(400).json({ error: "Invalid or missing 'status'" });
  }

  try {
    const expense = await Expense.findByPk(id);
    if (!expense) return res.status(404).json({ message: "Expense not found" });

    expense.status = status;
    await expense.save();
    res.status(200).json({ success: true, data: expense });
  } catch (error) {
    console.error("Error updating expense status:", error);
    res.status(500).json({ error: "Failed to update status", details: error.message });
  }
};

const deleteExpense = async (req, res) => {
  try {
    const expense = await Expense.findByPk(req.params.id);
    if (!expense) return res.status(404).json({ message: "Expense not found" });

    await expense.destroy(); // soft delete (paranoid)
    res.status(200).json({ success: true, message: "Expense deleted" });
  } catch (error) {
    console.error("Error deleting expense:", error);
    res.status(500).json({ error: "Failed to delete expense", details: error.message });
  }
};

// Receipt upload — multer (memory storage) puts the file on req.file.buffer;
// we push it to S3 ourselves and return the URL for the client to attach to a
// create/update payload. Mirrors the working pattern in fileUploadController.
const uploadReceipt = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    const file = req.file;
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, "-");
    const key = `expenses/receipts/${Date.now()}-${safeName}`;

    await s3.send(
      new PutObjectCommand({
        Bucket: psEnv.AWS_BUCKET_NAME,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
    );

    const url = `https://${psEnv.AWS_BUCKET_NAME}.s3.${psEnv.AWS_REGION}.amazonaws.com/${key}`;
    res.status(200).json({ success: true, url, key });
  } catch (error) {
    console.error("Error uploading receipt:", error);
    res.status(500).json({ error: "Failed to upload receipt", details: error.message });
  }
};

const getReportSummary = async (req, res) => {
  try {
    const summary = await getSummary(req.query);
    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    console.error("Error building report summary:", error);
    res.status(500).json({ error: "Failed to build summary", details: error.message });
  }
};

// Per-currency totals for the list footer — same filters as the list, across
// the whole result set (not just the current page).
const getTotals = async (req, res) => {
  try {
    const totals = await getTotalsByCurrency(req.query);
    res.status(200).json({ success: true, data: totals });
  } catch (error) {
    console.error("Error building expense totals:", error);
    res.status(500).json({ error: "Failed to build totals", details: error.message });
  }
};

// Full export of the CURRENT filtered set — same filters/search as the list, but
// unpaginated and with every column the client might want in a spreadsheet. The
// client turns this into XLSX/CSV, so the ordering here is the file's row order.
// Capped at EXPORT_ROW_CAP; `truncated` tells the admin to narrow the range.
const exportExpenses = async (req, res) => {
  try {
    const where = addJoinedSearch(buildExpenseWhere(req.query), req.query.search);

    const { count, rows } = await Expense.findAndCountAll({
      where,
      include: exportInclude,
      order: [["expense_date", "DESC"], ["createdAt", "DESC"]],
      limit: EXPORT_ROW_CAP,
      distinct: true,
      subQuery: false, // needed so the $creator.*$ search columns resolve
    });

    res.status(200).json({
      success: true,
      data: rows,
      count: rows.length,
      total: count,
      truncated: count > rows.length,
      cap: EXPORT_ROW_CAP,
    });
  } catch (error) {
    console.error("Error exporting expenses:", error);
    res.status(500).json({ error: "Failed to export expenses", details: error.message });
  }
};

// Bulk CSV import. Valid rows are committed in one transaction; invalid rows are
// skipped (never stored) and returned to the client with their original cells so
// the admin can download a fix-and-retry file.
const importExpenses = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "CSV file is required" });

    const result = await importExpensesFromCsv(req.file.buffer, {
      createdBy: req.staff?.id || req.user?.id || null,
    });

    // Whole-file problems (missing columns, over the row cap) mean nothing was
    // even attempted — that's a 422, not a partial success.
    if (result.fileError) {
      return res.status(422).json({ success: false, error: result.fileError });
    }

    res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("Error importing expenses:", error);
    res.status(500).json({ error: "Failed to import expenses", details: error.message });
  }
};

module.exports = {
  listExpenses,
  getExpenseById,
  createExpense,
  updateExpense,
  setExpenseStatus,
  deleteExpense,
  uploadReceipt,
  getReportSummary,
  getTotals,
  exportExpenses,
  importExpenses,
};
