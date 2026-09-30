import express from "express";

import {
  exportActivityLogs,
  getActivityFilters,
  getEntityActivity,
  listActivityLogs,
} from "../../controllers/activityLog/query.controller.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { requireRole } from "../../middlewares/requireRole.middleware.js";
import { ADMIN_ROLES } from "../../config/constants/admin.js";

const router = express.Router();

// Base URL: /activity-logs
//
// Read-only. Rows are written by the global activityLogger middleware; there is
// deliberately no POST/PUT/PATCH/DELETE here.
//
// Super Admin only — `adminAuth` alone proves just that a token is valid, which
// would let any admin read everyone else's history.
const superAdminOnly = [adminAuth, requireRole(ADMIN_ROLES.SUPER_ADMIN)];

router.get("/admin/logs", superAdminOnly, listActivityLogs);
router.get("/admin/logs/filters", superAdminOnly, getActivityFilters);
router.get("/admin/logs/export", superAdminOnly, exportActivityLogs);
router.get(
  "/admin/logs/entity/:entityType/:entityId",
  superAdminOnly,
  getEntityActivity,
);

export default router;
