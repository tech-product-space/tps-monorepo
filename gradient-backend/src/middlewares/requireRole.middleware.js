/**
 * Role gate, to be used *after* `adminAuth`.
 *
 * `adminAuth` only proves a token is valid — it does no role check, so any
 * authenticated admin can currently reach any `adminAuth` route. This is the
 * first place that gap is actually closed, because the activity log is the one
 * endpoint where "any admin can read everyone's history" is plainly wrong.
 *
 * Roles come from the JWT (`role` is the AdminRole name, set at login), so a
 * role change only takes effect on the admin's next login. That is acceptable
 * for widening access and worth knowing about when revoking it: to lock someone
 * out immediately, set `isActive: false` — the panel's AuthContext logs them out
 * on the next `GET /admins/auth/me`.
 */
export const requireRole =
  (...allowedRoles) =>
  (req, res, next) => {
    const role = req.admin?.role;

    if (!role) {
      return res.status(403).json({
        success: false,
        message: "Your role could not be determined. Please log in again.",
      });
    }

    if (!allowedRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to access this resource",
      });
    }

    return next();
  };

export default requireRole;
