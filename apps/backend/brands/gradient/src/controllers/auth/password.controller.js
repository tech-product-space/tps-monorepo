import db from "../../database/postgres/models/index.js";
const { User } = db;

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { generateToken, verifyToken } from "../../util/jwt.util.js";
import { hashPassword } from "../../util/password.util.js";
import { sendMail } from "../../services/email/sendMail.js";
import {
  BODIES,
  buildEmail,
  FOOTERS,
  HEADERS,
} from "../../services/email/index.js";

export const forgotPasswordController = asyncWrapper(async (req, res) => {
  const { email, resetPageLink } = req.body;

  if (!email || !resetPageLink) {
    return res.status(400).json({
      message: "'email' and 'resetPageLink' is required",
    });
  }

  const user = await User.findOne({
    where: { email },
  });

  // prevent email enumeration
  if (!user) {
    return res.json({
      message: "If the email exists, a reset link has been sent",
    });
  }

  // generate reset token
  const token = generateToken(
    {
      userId: user.id,
      type: "password_reset",
    },
    "15m",
  );

  const resetLink = `${resetPageLink}?token=${token}`;

  const html = buildEmail({
    body: BODIES.FORGOT_PASSWORD({
      name: user.fullName,
      resetLink,
    }),
    header: HEADERS.GRADIENT,
    footer: FOOTERS.GRADIENT,
  });

  const result = await sendMail({
    to: user.email,
    subject: "Reset your password",
    html,
  });

  if (!result.success) {
    throw new Error("Failed to send reset email");
  }

  return res.json({
    message: "If the email exists, a reset link has been sent",
  });
});

export const resetPasswordController = asyncWrapper(async (req, res) => {
  const { token, password, confirmPassword } = req.body;

  if (!token || !password || !confirmPassword) {
    return res.status(400).json({
      message: "Token and passwords are required",
    });
  }

  if (password !== confirmPassword) {
    return res.status(400).json({
      message: "Passwords do not match",
    });
  }

  let decoded;

  try {
    decoded = verifyToken(token);
  } catch (err) {
    return res.status(400).json({
      message: "Invalid or expired token",
    });
  }

  if (decoded.type !== "password_reset") {
    return res.status(400).json({
      message: "Invalid token",
    });
  }

  const user = await User.findByPk(decoded.userId);

  if (!user) {
    return res.status(404).json({
      message: "User not found",
    });
  }

  const hashedPassword = await hashPassword(password);

  await user.update({
    password: hashedPassword,
  });

  return res.json({
    message: "Password reset successful",
  });
});
