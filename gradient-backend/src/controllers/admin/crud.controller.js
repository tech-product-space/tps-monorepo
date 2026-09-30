import { Op } from "sequelize";

import {
  ADMIN_INVITE_STATUS,
  ADMIN_PASSWORD_MIN_LENGTH,
  ADMIN_ROLES,
  ADMIN_TOKEN_TYPE,
} from "../../config/constants/admin.js";
import db from "../../database/postgres/models/index.js";

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { verifyToken } from "../../util/jwt.util.js";
import { hashPassword } from "../../util/password.util.js";
import { invalidateActorCache } from "../../services/activityLog/recordActivity.service.js";
import {
  sendAdminInviteEmail,
  sendAdminPasswordResetEmail,
  sendAdminTempPasswordEmail,
} from "../../services/admin/adminEmail.service.js";
import { buildChanges, snapshot } from "../../util/helpers/activityDiff.js";

const { AdminUser, AdminRole } = db;

const isWeakPassword = (password) =>
  typeof password !== "string" || password.length < ADMIN_PASSWORD_MIN_LENGTH;

/**
 * Refuses an edit that would leave the panel with no active Super Admin.
 *
 * Users and Activity are Super Admin–only server-side, so demoting, disabling
 * or deleting the last one locks the whole organisation out of both with no
 * in-app way back — it would take a manual database write to recover. Reachable
 * from the UI now that roles are editable from the table.
 *
 * Returns an error message, or null when the change is safe.
 */
const lastSuperAdminBlocker = async (admin, { roleId, isActive } = {}) => {
  // Every row carrying the name, not `findOne` — a unique index guards against
  // duplicates now, but a single-row lookup would silently pick one of several
  // and wave through a demotion of an admin holding one of the others.
  const superRoles = await AdminRole.findAll({
    attributes: ["id"],
    where: { name: ADMIN_ROLES.SUPER_ADMIN },
  });

  if (!superRoles.length) return null;

  const superRoleIds = superRoles.map((role) => role.id);

  const isActiveSuperAdmin =
    superRoleIds.includes(admin.roleId) && admin.isActive;

  if (!isActiveSuperAdmin) return null;

  // `undefined` means "not part of this request", so it leaves the field as is.
  const keepsRole = roleId === undefined || superRoleIds.includes(roleId);
  const keepsActive = isActive === undefined || isActive === true;

  if (keepsRole && keepsActive) return null;

  const others = await AdminUser.count({
    where: {
      roleId: { [Op.in]: superRoleIds },
      isActive: true,
      id: { [Op.ne]: admin.id },
    },
  });

  if (others > 0) return null;

  return "This is the only active Super Admin. Promote another admin first, or you will lock everyone out of Users and Activity.";
};

export const createAdmin = asyncWrapper(async (req, res) => {
  const { name, email, roleId, passwordResetPageUrl, password, loginUrl } =
    req.body;

  // Two ways to onboard. Without `password` the admin gets an emailed invite
  // link and sets their own; with one they can sign in immediately, which is
  // what you want when someone needs access during a call rather than whenever
  // they next read their inbox.
  const useTemporaryPassword = Boolean(password);

  if (useTemporaryPassword && isWeakPassword(password)) {
    return res.status(400).json({
      message: `Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters`,
    });
  }

  if (!useTemporaryPassword && !passwordResetPageUrl) {
    return res.status(400).json({
      message: "passwordResetPageUrl is required when no password is set",
    });
  }

  const existing = await AdminUser.findOne({
    where: { email },
  });

  if (existing) {
    return res.status(400).json({
      message: "Email already exists",
    });
  }

  const role = await AdminRole.findByPk(roleId);

  if (!role) {
    return res.status(400).json({
      message: "Select a valid role",
    });
  }

  const admin = await AdminUser.create({
    name,
    email,
    password: useTemporaryPassword ? await hashPassword(password) : null,
    // A temporary password is a completed onboarding — there is no invite left
    // to accept, and leaving it pending would offer a "Resend invite" action
    // that mints a link bypassing the password just set.
    inviteStatus: useTemporaryPassword
      ? ADMIN_INVITE_STATUS.ACCEPTED
      : ADMIN_INVITE_STATUS.PENDING,
    roleId,
  });

  // Set explicitly: this route responds { admin, inviteLink } rather than the
  // usual { data }, so the log cannot infer the id from the response shape.
  req.activity?.set({
    entityId: admin.id,
    entityLabel: admin.email,
    changes: { name: { from: null, to: name }, roleId: { from: null, to: roleId } },
    metadata: { onboarding: useTemporaryPassword ? "temporaryPassword" : "invite" },
  });

  if (useTemporaryPassword) {
    const { emailed } = await sendAdminTempPasswordEmail({
      admin,
      temporaryPassword: password,
      loginUrl,
    });

    return res.status(201).json({ admin, emailed });
  }

  const { inviteLink, emailed } = await sendAdminInviteEmail({
    admin,
    roleName: role.name,
    passwordResetPageUrl,
  });

  res.status(201).json({
    admin,
    inviteLink,
    emailed,
  });
});

export const setPassword = asyncWrapper(async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({
      message: "Token and password required",
    });
  }

  if (isWeakPassword(password)) {
    return res.status(400).json({
      message: `Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters`,
    });
  }

  let payload;

  try {
    payload = verifyToken(token);
  } catch (error) {
    return res.status(400).json({
      message: "Invalid or expired link",
    });
  }

  // One form, two token types: an invite the admin is accepting for the first
  // time, and a reset a Super Admin sent them afterwards.
  const isInvite = payload.type === ADMIN_TOKEN_TYPE.INVITE;
  const isReset = payload.type === ADMIN_TOKEN_TYPE.PASSWORD_RESET;

  if (!isInvite && !isReset) {
    return res.status(400).json({
      message: "Invalid token type",
    });
  }

  const admin = await AdminUser.findByPk(payload.adminId);

  if (!admin) {
    return res.status(404).json({
      message: "User not found",
    });
  }

  // Single-use, for invites only: an invite token stays valid for 24h, so
  // without this an old link in an inbox could reset a password set days ago.
  // A reset token is deliberately reusable within its shorter hour.
  if (isInvite && admin.inviteStatus === ADMIN_INVITE_STATUS.ACCEPTED) {
    return res.status(400).json({
      message: "Invite link already used",
    });
  }

  if (!admin.isActive && isReset) {
    return res.status(403).json({
      message: "This account is disabled. Contact a Super Admin.",
    });
  }

  const hashed = await hashPassword(password);

  await admin.update({
    password: hashed,
    isActive: true,
    inviteStatus: ADMIN_INVITE_STATUS.ACCEPTED
  });

  res.json({
    message: "Password set successfully",
  });
});

export const getAdmins = asyncWrapper(async (req, res) => {
  const admins = await AdminUser.findAll({
    attributes: {
      exclude: ["password"],
    },
    include: [
      {
        model: AdminRole,
        as: "role",
        attributes: ["id", "name"],
      },
    ],
  });

  res.json(admins);
});

export const getAdminById = asyncWrapper(async (req, res) => {
  const admin = await AdminUser.findByPk(req.params.id, {
    attributes: { exclude: ["password"] },
  });

  res.json(admin);
});

export const updateAdmin = asyncWrapper(async (req, res) => {
  const { name, roleId, isActive } = req.body;

  const admin = await AdminUser.findByPk(req.params.id);

  if (!admin) {
    return res.status(404).json({
      message: "User not found",
    });
  }

  if (roleId !== undefined && roleId !== admin.roleId) {
    const role = await AdminRole.findByPk(roleId);

    if (!role) {
      return res.status(400).json({
        message: "Select a valid role",
      });
    }
  }

  const blocker = await lastSuperAdminBlocker(admin, { roleId, isActive });

  if (blocker) {
    return res.status(409).json({ message: blocker });
  }

  const before = snapshot(admin, ["name", "roleId", "isActive"]);

  await admin.update({
    name,
    roleId,
    isActive,
  });

  // The log caches name/email per admin, so a rename has to drop that entry or
  // the next few rows would carry the old name.
  invalidateActorCache(admin.id);

  req.activity?.set({
    entityLabel: admin.email,
    changes: buildChanges(before, snapshot(admin, Object.keys(before))),
  });

  res.json(admin);
});

export const deleteAdmin = asyncWrapper(async (req, res) => {
  const admin = await AdminUser.findByPk(req.params.id);

  if (!admin) {
    return res.status(404).json({
      message: "User not found",
    });
  }

  const blocker = await lastSuperAdminBlocker(admin, { isActive: false });

  if (blocker) {
    return res.status(409).json({ message: blocker });
  }

  // Captured before the row is gone — the log keeps the label, and the deleted
  // admin's own history keeps their name because actor data is denormalised.
  req.activity?.set({ entityLabel: admin?.email || null });

  await admin.destroy();

  invalidateActorCache(req.params.id);

  res.json({
    message: "Admin deleted",
  });
});

/**
 * Re-issues an invite for an admin who never finished onboarding — the old link
 * expired, went to spam, or was lost when the create dialog was closed. Before
 * this the only recovery was deleting the row and recreating it.
 */
export const resendInvite = asyncWrapper(async (req, res) => {
  const { passwordResetPageUrl } = req.body;

  if (!passwordResetPageUrl) {
    return res.status(400).json({
      message: "passwordResetPageUrl is required",
    });
  }

  const admin = await AdminUser.findByPk(req.params.id, {
    include: [{ model: AdminRole, as: "role", attributes: ["id", "name"] }],
  });

  if (!admin) {
    return res.status(404).json({
      message: "User not found",
    });
  }

  if (admin.inviteStatus === ADMIN_INVITE_STATUS.ACCEPTED) {
    return res.status(400).json({
      message:
        "This admin has already set a password. Use Reset password instead.",
    });
  }

  const { inviteLink, emailed } = await sendAdminInviteEmail({
    admin,
    roleName: admin.role?.name,
    passwordResetPageUrl,
  });

  req.activity?.set({ entityLabel: admin.email });

  res.json({
    message: emailed
      ? `Invite resent to ${admin.email}`
      : "Invite regenerated, but the email could not be sent",
    inviteLink,
    emailed,
  });
});

/**
 * Two modes, because the two real situations differ:
 *
 *   "link"      — email a reset link; nobody but the admin ever knows the
 *                 password. The default, and the right one almost always.
 *   "temporary" — set a password the Super Admin already has on screen, for
 *                 when someone needs access now and can be told it directly.
 *
 * The temporary password is generated in the browser and shown in the dialog,
 * so it is never returned here — this endpoint only hashes what it is given.
 */
export const resetAdminPassword = asyncWrapper(async (req, res) => {
  const { mode = "link", password, resetPageUrl, loginUrl } = req.body;

  const admin = await AdminUser.findByPk(req.params.id);

  if (!admin) {
    return res.status(404).json({
      message: "User not found",
    });
  }

  if (admin.inviteStatus !== ADMIN_INVITE_STATUS.ACCEPTED) {
    return res.status(400).json({
      message:
        "This admin has not accepted their invite yet. Use Resend invite instead.",
    });
  }

  req.activity?.set({
    entityLabel: admin.email,
    metadata: { mode },
  });

  if (mode === "temporary") {
    if (isWeakPassword(password)) {
      return res.status(400).json({
        message: `Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters`,
      });
    }

    await admin.update({ password: await hashPassword(password) });

    const { emailed } = await sendAdminTempPasswordEmail({
      admin,
      temporaryPassword: password,
      loginUrl,
      isReset: true,
    });

    return res.json({
      message: emailed
        ? `Temporary password set and emailed to ${admin.email}`
        : "Temporary password set, but the email could not be sent",
      emailed,
    });
  }

  if (!resetPageUrl) {
    return res.status(400).json({
      message: "resetPageUrl is required",
    });
  }

  const { resetLink, emailed } = await sendAdminPasswordResetEmail({
    admin,
    resetPageUrl,
  });

  res.json({
    message: emailed
      ? `Reset link sent to ${admin.email}`
      : "Reset link generated, but the email could not be sent",
    resetLink,
    emailed,
  });
});

export const createRoles = asyncWrapper(async (req, res) => {
  const admin = await AdminRole.findAll();

  await admin.update({
    name,
    roleId,
    isActive,
  });

  res.json(admin);
});

export const getRoles = asyncWrapper(async (req, res) => {
  const roles = await AdminRole.findAll();
  res.json(roles);
});

export const createRole = asyncWrapper(async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({
      message: "Role name is required",
    });
  }

  const existing = await AdminRole.findOne({
    where: { name },
  });

  if (existing) {
    return res.status(400).json({
      message: "Role already exists",
    });
  }

  const role = await AdminRole.create({
    name,
  });

  res.status(201).json(role);
});
