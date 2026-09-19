"use strict";
const express = require("express");
const router = express.Router();
const metaController = require("../controllers/meta.controller");
const { authenticate, requireRole } = require("../middlewares/auth.middleware");

// Everything here is Superadmin-only Facebook lead-integration config.
router.use(authenticate, requireRole(["Superadmin"]));

// Global settings + monitoring
router.get("/settings", metaController.getSettings);
router.put("/settings", metaController.updateSettings);
router.get("/logs", metaController.getLogs);
router.get("/stats", metaController.getStats);

// Manual triggers
router.post("/sync-all", metaController.syncAll);
router.post("/poll-now", metaController.pollNow);

// Accounts
router.get("/accounts", metaController.listAccounts);
router.post("/accounts", metaController.createAccount);
router.put("/accounts/:id", metaController.updateAccount);
router.delete("/accounts/:id", metaController.deleteAccount);
router.post("/accounts/:id/validate-token", metaController.validateToken);
router.post("/accounts/:id/sync-forms", metaController.syncForms);
router.get("/accounts/:id/forms", metaController.listForms);

// Forms
router.put("/forms/:formId", metaController.updateForm);
router.post("/forms/:formId/backfill", metaController.startBackfill);

module.exports = router;
