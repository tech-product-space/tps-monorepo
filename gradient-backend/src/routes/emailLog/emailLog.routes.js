import express from "express";
import {
  getEmailDispatchLogs,
  getEmailDispatchStats,
  getEmailDispatchLogById,
  getEmailFilterOptions,
} from "../../controllers/emailLog/emailLog.controller.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { requireRole } from "../../middlewares/requireRole.middleware.js";
import { ADMIN_ROLES } from "../../config/constants/admin.js";

const router = express.Router();

// Super Admin only: Email logs contain sensitive recipient data and delivery telemetry
const superAdminOnly = [adminAuth, requireRole(ADMIN_ROLES.SUPER_ADMIN)];

router.get("/admin/logs", superAdminOnly, getEmailDispatchLogs);
router.get("/admin/stats", superAdminOnly, getEmailDispatchStats);
router.get("/admin/filter-options", superAdminOnly, getEmailFilterOptions);
router.get("/admin/logs/:id", superAdminOnly, getEmailDispatchLogById);

export default router;
