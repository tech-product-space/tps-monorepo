const jwt = require("jsonwebtoken");
const db = require("../models");

const SECRET_KEY = process.env.JWT_SECRET || "your_secret_key";
const { users } = db;

// Attaches req.appUser when the caller happens to be a signed-in public-site
// user, and does nothing at all when they are not.
//
// `requireUser` is the wrong middleware for a route like the recordings gate:
// the gate is open to anybody, and a 401 for a visitor without an account would
// close the very door the feature exists to open. This one only enriches the
// row that is about to be written — a lead we can tie to a user is worth more
// than one we cannot, but it is never a condition of writing it.
//
// Every failure path is silent by design: an expired token, a staff token, a
// deleted user. None of them are the visitor's problem.
module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) return next();

    const decoded = jwt.verify(authHeader.split(" ")[1], SECRET_KEY);

    // A staff token carries `role`; it is not a public-site user and must not
    // be recorded as one.
    if (!decoded || !decoded.user_id || decoded.role) return next();

    const user = await users.findByPk(decoded.user_id);
    if (user) req.appUser = user;

    return next();
  } catch (error) {
    return next();
  }
};
