const express = require("express");
const router = express.Router();

const upload = require("../middlewares/multer");
const uploadCsv = require("../middlewares/uploadCsv");
const requireStaff = require("../middlewares/requireStaff");
const {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  createSubcategory,
  updateSubcategory,
  deleteSubcategory,
} = require("../controllers/expense/categoryController");
const {
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
} = require("../controllers/expense/expenseController");
const {
  listPaymentAccounts,
  createPaymentAccount,
  updatePaymentAccount,
  archivePaymentAccount,
} = require("../controllers/expense/paymentAccountController");
const {
  listRecurring,
  createRecurring,
  updateRecurring,
  toggleRecurring,
  deleteRecurring,
  runRecurringNow,
} = require("../controllers/expense/recurringController");
const {
  listTeams,
  createTeam,
  updateTeam,
  deleteTeam,
} = require("../controllers/expense/teamController");

// Every expense endpoint is admin-only (categories, teams, recurring, the list,
// reports, totals…). The public submission forms live on a separate router
// (/expense-forms), so this guard never touches the logged-out flow. Staff
// identity is also what stamps created_by on writes.
router.use(requireStaff);

/* ------------------------------- categories ------------------------------- */
router.get("/categories", listCategories);
router.post("/categories", createCategory);
router.put("/categories/:id", updateCategory);
router.delete("/categories/:id", deleteCategory);
router.post("/categories/:id/subcategories", createSubcategory);
router.put("/subcategories/:id", updateSubcategory);
router.delete("/subcategories/:id", deleteSubcategory);

/* --------------------------------- teams ---------------------------------- */
router.get("/teams", listTeams);
router.post("/teams", createTeam);
router.put("/teams/:id", updateTeam);
router.delete("/teams/:id", deleteTeam);

/* -------------------------------- recurring ------------------------------- */
router.get("/recurring", listRecurring);
router.post("/recurring", createRecurring);
router.post("/recurring/run", runRecurringNow);
router.put("/recurring/:id", updateRecurring);
router.patch("/recurring/:id/toggle", toggleRecurring);
router.delete("/recurring/:id", deleteRecurring);

/* --------------------------------- reports -------------------------------- */
router.get("/reports/summary", getReportSummary);
router.get("/totals", getTotals);

/* --------------------------------- export --------------------------------- */
// Unpaginated dump of the current filter set, for the spreadsheet download.
router.get("/export", exportExpenses);

/* -------------------------------- receipts -------------------------------- */
router.post("/upload-receipt", upload.single("receipt"), uploadReceipt);

/* ---------------------------- payment accounts ----------------------------- */
router.get("/payment-accounts", listPaymentAccounts);
router.post("/payment-accounts", createPaymentAccount);
router.put("/payment-accounts/:id", updatePaymentAccount);
router.delete("/payment-accounts/:id", archivePaymentAccount);

/* -------------------------------- bulk import ------------------------------ */
// Multer rejects non-.csv and >5MB files by throwing; catch it here so the admin
// gets a readable message instead of whatever the global handler renders.
const csvUpload = (req, res, next) =>
  uploadCsv.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    next();
  });

router.post("/import", csvUpload, importExpenses);

/* -------------------------------- expenses -------------------------------- */
// Keep the generic "/:id" routes last so they don't shadow the static paths above.
router.get("/", listExpenses);
router.post("/", createExpense);
router.get("/:id", getExpenseById);
router.put("/:id/update", updateExpense);
router.patch("/:id/status", setExpenseStatus);
router.delete("/:id", deleteExpense);

module.exports = router;
