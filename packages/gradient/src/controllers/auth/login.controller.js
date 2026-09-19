import db from "../../database/postgres/models/index.js";
const { User } = db;

import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import {
  USER_ACCESS_TOKEN_KEY,
  USER_LOGIN_SOURCE,
  USER_STATUS,
} from "../../config/constants/user.js";
import { comparePassword } from "../../util/password.util.js";
import { generateToken } from "../../util/jwt.util.js";
import env from "../../config/env.js";
import { googleAuthClient } from "../../config/google/auth.js";

const isProduction = env.APP_ENVIRONMENT === "production";

export const loginController = asyncWrapper(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password are required",
    });
  }

  const user = await User.findOne({
    where: { email },
  });

  if (!user) {
    return res.status(401).json({
      message: "Invalid email or password",
    });
  }

  if (user.status === USER_STATUS.BLOCKED) {
    return res.status(403).json({
      message: "Account is blocked",
    });
  }

  if (!user.password) {
    return res.status(400).json({
      message:
        "Incorrect password",
    });
  }

  const isPasswordValid = await comparePassword(password, user.password);

  if (!isPasswordValid) {
    return res.status(401).json({
      message: "Incorrect password",
    });
  }

  const token = generateToken(
    {
      userId: user.id,
      type: "website_user",
    },
    "30d",
  );

  await user.update({
    lastLoginAt: new Date(),
    loginSource: USER_LOGIN_SOURCE.EMAIL,
  });

  res.cookie(USER_ACCESS_TOKEN_KEY, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, //7 days
  });

  return res.json({
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      profilePicture: user.profilePicture,
      emailVerified: user.emailVerified,
    },
  });
});

export const googleLoginController = asyncWrapper(async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({
      message: "Google token required",
    });
  }

  const ticket = await googleAuthClient.verifyIdToken({
    idToken,
    audience: env.google.auth.clientId,
  });

  const payload = ticket.getPayload();

  const { sub: googleId, email, name, picture } = payload;

  let user = await User.findOne({
    where: { email },
  });

  if (!user) {
    user = await User.create({
      fullName: name,
      email,
      profilePicture: picture,
      providerId: googleId,
      loginSource: USER_LOGIN_SOURCE.GOOGLE,
      emailVerified: true,
      status: USER_STATUS.ACTIVE,
    });
  }

  const token = generateToken(
    {
      userId: user.id,
      type: "website_user",
    },
    "30d",
  );

  await user.update({
    emailVerified: true,
    lastLoginAt: new Date(),
    loginSource: USER_LOGIN_SOURCE.GOOGLE,
  });

  res.cookie(USER_ACCESS_TOKEN_KEY, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return res.json({
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      profilePicture: user.profilePicture,
      emailVerified: user.emailVerified,
    },
  });
});
