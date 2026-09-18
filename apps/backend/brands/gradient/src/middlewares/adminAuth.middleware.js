import { verifyToken } from "../util/jwt.util.js";
import db from "../database/postgres/models/index.js";

/**
 * Unified-identity admin auth (tps-monorepo).
 *
 * Login now happens once, against the CRM backend
 * (`crm/src/controllers/auth.controller.js`), which issues a JWT carrying a
 * `workspaces: [{ workspace, role }]` claim — see tps-monorepo/apps/backend/README.md
 * and the AdminWorkspaceGrant model. This middleware trusts that JWT (same
 * JWT_SECRET / env.jwt.auth.secret across all three backend targets — this
 * MUST be identical in tps/gradient/crm env config or tokens silently fail to
 * verify) rather than a locally-issued Gradient token.
 *
 * `AdminUser` stays the local identity anchor for gradient_db foreign keys
 * (activity log actor snapshots, course/blog "created by", etc.), so we
 * JIT-provision an `AdminUser` (+ matching `AdminRole` by name) the first
 * time a given admin is seen here, instead of migrating every FK to the
 * CRM's `users.id`. `password` stays null — nobody logs in locally anymore.
 */
export const adminAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        message: "Authorization token required",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        message: "Invalid authorization format",
      });
    }

    const decoded = verifyToken(token);

    if (!decoded || !decoded.email) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const grant = (decoded.workspaces || []).find((w) => w.workspace === "gradient");
    if (!grant) {
      return res.status(403).json({
        message: "No access to the Gradient workspace",
      });
    }

    const [role] = await db.AdminRole.findOrCreate({
      where: { name: grant.role },
      defaults: { name: grant.role },
    });

    const [adminUser] = await db.AdminUser.findOrCreate({
      where: { email: decoded.email.toLowerCase().trim() },
      defaults: {
        name: decoded.name || decoded.email,
        email: decoded.email.toLowerCase().trim(),
        roleId: role.id,
        password: null,
        inviteStatus: "accepted",
      },
    });

    if (adminUser.roleId !== role.id) {
      adminUser.roleId = role.id;
      await adminUser.save();
    }

    // Same shape the old locally-issued token carried, so downstream code
    // (requireRole, the activity logger's actor snapshot) needs no changes.
    req.admin = {
      id: adminUser.id,
      roleId: role.id,
      role: role.name,
      name: adminUser.name,
      email: adminUser.email,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
};
