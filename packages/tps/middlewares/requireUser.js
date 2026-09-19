const psEnv = require("@ps/env/tps");
const jwt = require("jsonwebtoken");
const db = require("../models");

const SECRET_KEY = psEnv.JWT_SECRET || "your_secret_key";
const { users } = db;

// Authenticates a logged-in public-site user. Their JWT payload is
// { user_id, email } (no `role` claim — that's how we tell it apart from a
// staff/company token). Loads the user and attaches req.appUser.
module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, SECRET_KEY);

    if (!decoded || !decoded.user_id) {
      return res.status(401).json({ message: "Invalid token" });
    }

    const user = await users.findByPk(decoded.user_id);
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    req.appUser = user;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
