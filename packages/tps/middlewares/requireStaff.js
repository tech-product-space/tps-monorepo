const jwt = require("jsonwebtoken");
const db = require("../models");

const SECRET_KEY = require("../utils/jwtSecret");
const { company } = db;

// Authenticates an admin/superadmin staff member. Their access-token payload is
// { user_id, role, type: "access" } and is signed with the same secret as user
// tokens, so we distinguish staff by the presence of `role`.
//
// Expired access tokens are rejected with 401 so the admin panel can silently
// swap in a fresh one via POST /company/refresh and retry (see PrivateAxios).
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

    // A refresh token must never be accepted as an access token.
    if (!decoded || !decoded.user_id || !decoded.role || decoded.type === "refresh") {
      return res.status(403).json({ message: "Staff access required" });
    }

    const staff = await company.findByPk(decoded.user_id);
    if (!staff) {
      return res.status(403).json({ message: "Staff account not found" });
    }

    req.staff = staff;
    req.staffRole = decoded.role;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
};
