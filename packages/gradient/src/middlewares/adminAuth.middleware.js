import { verifyToken } from "../util/jwt.util.js";

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

    const admin = verifyToken(token);

    if (!admin) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    req.admin = admin;

    next();
  } catch (error) {
    return res.status(401).json({
      message: "Invalid or expired token",
    });
  }
};
