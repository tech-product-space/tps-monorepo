import asyncWrapper from "../../util/helpers/asyncWrapper.js";
import { USER_ACCESS_TOKEN_KEY } from "../../config/constants/user.js";
import env from "../../config/env.js";

const isProduction = env.APP_ENVIRONMENT === "production";

export const logoutController = asyncWrapper(async (req, res) => {
  res.clearCookie(USER_ACCESS_TOKEN_KEY, {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
  });

  return res.status(200).json({
    message: "Logged out successfully",
  });
});