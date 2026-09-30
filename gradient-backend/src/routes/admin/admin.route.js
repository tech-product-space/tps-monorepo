import express from "express";

import { getMe, login } from "../../controllers/admin/auth.controller.js";
import { createAdmin, createRole, deleteAdmin, getAdminById, getAdmins, getRoles, resendInvite, resetAdminPassword, setPassword, updateAdmin } from "../../controllers/admin/crud.controller.js";
import { adminAuth } from "../../middlewares/adminAuth.middleware.js";
import { requireRole } from "../../middlewares/requireRole.middleware.js";
import { ADMIN_ROLES } from "../../config/constants/admin.js";

const router = express.Router();

// Admin *management* — who exists in the panel and what they can do — is Super
// Admin only. `adminAuth` alone just proves a token is valid, which would let
// any admin list their colleagues, invite new ones, or promote themselves by
// PATCHing their own roleId. The panel hides the Users page for other roles,
// but that is UI convenience; this is the enforcement.
const superAdminOnly = [adminAuth, requireRole(ADMIN_ROLES.SUPER_ADMIN)];

router.post("/roles", superAdminOnly, createRole);
router.get("/roles", superAdminOnly, getRoles);

// Auth routes stay open to every admin — login and the invite flow are how a
// non-Super-Admin gets a token in the first place, and /auth/me is what the
// panel calls on every page load to validate it.
router.post("/auth/login", login);
router.post("/auth/set-password", setPassword);
router.get("/auth/me", adminAuth, getMe);

// These were open until the activity log landed: anyone who could reach the API
// could create an admin user, and the log would have recorded it with no actor.
// The panel already sends the bearer token on all five via PrivateAxios.
router.post("/", superAdminOnly, createAdmin);
router.get("/", superAdminOnly, getAdmins);

// Onboarding recovery: re-issue a lost invite, or reset a password the admin
// can no longer use. Both email the admin and fall back to a copyable link.
router.post("/:id/resend-invite", superAdminOnly, resendInvite);
router.post("/:id/reset-password", superAdminOnly, resetAdminPassword);

router.get("/:id", superAdminOnly, getAdminById);
router.patch("/:id", superAdminOnly, updateAdmin);
router.delete("/:id", superAdminOnly, deleteAdmin);

export default router;