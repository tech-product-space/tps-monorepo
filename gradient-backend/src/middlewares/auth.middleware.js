import { USER_ACCESS_TOKEN_KEY } from "../config/constants/user.js";
import asyncWrapper from "../util/helpers/asyncWrapper.js";
import { verifyToken } from "../util/jwt.util.js";

export const authMiddleware = asyncWrapper(async (req, res, next) => {
  const token = req.cookies?.[USER_ACCESS_TOKEN_KEY];

  if (!token) {
    return res.status(401).json({
      message: "Unauthorized",
    });
  }

  let decoded;

  try {
    decoded = verifyToken(token);
  } catch (err) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }

  if (decoded.type !== "website_user") {
    return res.status(403).json({
      message: "Invalid token type",
    });
  }

  req.user = {
    id: decoded.userId
  };

  next();
});

/**
 * Attaches req.user when a valid session cookie is present, and simply carries
 * on when it is not.
 *
 * The feedback flow is open to people with no account — a teammate named in
 * someone else's submission may never have registered, let alone signed up. But
 * when the visitor IS signed in we want to identify them from the cookie rather
 * than from a typed email, because a cookie cannot be mistyped or guessed.
 *
 * A bad or expired token is treated as absent rather than rejected: this is a
 * route anyone may use, so a stale cookie should not lock someone out of it.
 */
export const optionalAuthMiddleware = asyncWrapper(async (req, res, next) => {
  const token = req.cookies?.[USER_ACCESS_TOKEN_KEY];

  if (!token) return next();

  try {
    const decoded = verifyToken(token);

    if (decoded.type === "website_user") {
      req.user = { id: decoded.userId };
    }
  } catch {
    // Anonymous, not unauthorised.
  }

  next();
});