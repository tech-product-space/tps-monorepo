const requireStaff = require("./requireStaff");

// Backend deploys are allowed only for the accounts named in DEPLOY_ADMIN_EMAILS
// (comma-separated). Being a superadmin is not enough.
//
// Everyone else gets 404, not 403, so the deploy API does not reveal that it
// exists. With the variable unset, as on every developer laptop, nobody is
// allowed: deploys can only be started from the production server.
const allowed = () =>
  (process.env.DEPLOY_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

module.exports = (req, res, next) =>
  requireStaff(req, res, () => {
    const email = String(req.staff.email || "").toLowerCase();
    if (!allowed().includes(email)) {
      return res.status(404).json({ message: "Not found" });
    }
    next();
  });
