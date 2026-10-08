const requireStaff = require("./requireStaff");

// A signed-in staff member whose account is a superadmin right now.
//
// The role is read from the database row requireStaff loaded, not from the
// token: tokens live for days, so a demoted superadmin would otherwise keep
// superadmin powers until theirs expired.
module.exports = (req, res, next) =>
  requireStaff(req, res, () => {
    if (req.staff.role !== "superadmin") {
      return res.status(403).json({ message: "Superadmin access required" });
    }
    next();
  });
