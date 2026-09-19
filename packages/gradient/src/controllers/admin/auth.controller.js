import db from "../../database/postgres/models/index.js";

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { generateToken } from "../../util/jwt.util.js";
import { comparePassword } from "../../util/password.util.js";

const { AdminUser, AdminRole } = db;

export const login = asyncWrapper(async (req, res) => {
  const { email, password } = req.body;

  if (!password) {
    return res.status(400).json({
      message: "password is required",
    });
  }

  const admin = await AdminUser.findOne({
    where: { email, isActive: true },
    include: [
      {
        model: AdminRole,
        as: "role",
        attributes: ["id", "name"],
      },
    ],
  });

  if (!admin) {
    return res.status(401).json({
      message: "Invalid credentials",
    });
  }

  const valid = await comparePassword(password, admin.password);

  if (!valid) {
    return res.status(401).json({
      message: "Invalid credentials",
    });
  }

  // `name` and `email` are carried so the activity log can attribute a row
  // without a lookup. Tokens issued before this are valid for 30 days and lack
  // them — the log falls back to a cached AdminUser lookup for those.
  const token = generateToken(
    {
      id: admin.id,
      roleId: admin.roleId,
      role: admin.role?.name,
      name: admin.name,
      email: admin.email,
    },
    "30d",
  );

  await admin.update({
    lastLogin: new Date(),
  });

  const adminData = admin.get({ plain: true });

  delete adminData.password;

  res.json({
    token,
    admin: adminData,
  });
});

export const getMe = asyncWrapper(async (req, res) => {
  const admin = await AdminUser.findByPk(req.admin.id, {
    attributes: { exclude: ["password"] },
    include: [
      {
        model: AdminRole,
        as: "role",
        attributes: ["id", "name"],
      },
    ],
  });

  if (!admin) {
    return res.status(404).json({
      message: "Admin not found",
    });
  }

  res.json(admin);
});
