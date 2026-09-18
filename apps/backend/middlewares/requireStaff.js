const jwt = require("jsonwebtoken");
const db = require("../models");

const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";
const { company } = db;

/**
 * Unified-identity staff auth (tps-monorepo).
 *
 * Login now happens once, against the CRM backend (`crm/src/controllers/auth.controller.js`),
 * which issues a JWT carrying a `workspaces: [{ workspace, role }]` claim — see
 * tps-monorepo/apps/backend/README.md and the AdminWorkspaceGrant model. This
 * middleware trusts that JWT (same JWT_SECRET across all three backend
 * targets — this MUST be identical in tps/gradient/crm env config or tokens
 * silently fail to verify) rather than checking a locally-issued token.
 *
 * `company` stays the local identity anchor for tps_db foreign keys (staff_id
 * on countless tps-domain tables), so we JIT-provision a `company` row keyed
 * by email the first time a given admin is seen here, instead of migrating
 * every FK in tps_db to point at the CRM's `users.id`. The row's `password`
 * stays null — nobody logs in locally anymore, only via the shared token.
 */
module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const token = authHeader.split(" ")[1];

    let decoded;
    try {
      decoded = jwt.verify(token, SECRET_KEY);
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    if (!decoded || !decoded.email || decoded.type === "refresh") {
      return res.status(403).json({ message: "Staff access required" });
    }

    const grant = (decoded.workspaces || []).find((w) => w.workspace === "tps");
    if (!grant) {
      return res.status(403).json({ message: "No access to the TPS workspace" });
    }

    const [staff] = await company.findOrCreate({
      where: { email: decoded.email.toLowerCase().trim() },
      defaults: {
        name: decoded.name || decoded.email,
        email: decoded.email.toLowerCase().trim(),
        role: grant.role,
        password: null,
      },
    });

    // Role can change on the CRM side (regrant) without a matching write here
    // happening automatically — keep the local mirror in sync on every request.
    if (staff.role !== grant.role) {
      staff.role = grant.role;
      await staff.save();
    }

    req.staff = staff;
    req.staffRole = grant.role;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
