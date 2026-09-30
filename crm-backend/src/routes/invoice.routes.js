const express = require("express");
const router = express.Router();

const { authenticate } = require("../middlewares/auth.middleware");
const invoiceController = require("../controllers/invoice.controller");

// BASE URL -> /invoices
// Role scoping is applied inside the service via getScopedUserIds (frozen
// enrollment owner). Document download/send actions reuse the existing
// /payment/invoice and /payment/receipt endpoints (now scope-guarded).
router.use(authenticate);

router.get("/", invoiceController.listInvoices);
router.get("/courses", invoiceController.listInvoiceCourses);

module.exports = router;
