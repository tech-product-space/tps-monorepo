"use strict";

const { sequelize } = require("../../../models");

/**
 * Build a Sequelize OR-clause array that matches a single person across
 * possibly-different lead source rows. Two enrollments are considered the
 * same person if any of these match:
 *
 *   - lowercase(lead_email_snapshot) = lowercase(leadEmail)
 *   - lead_phone_snapshot = trim(leadPhone)
 *   - (lead_source_type, lead_source_id) tuple equality (legacy fallback for
 *     rows whose snapshots are null)
 *
 * Returned array is suitable for `where: { [Op.or]: ... }`.
 */
function buildIdentityOr({
  leadSourceType,
  leadSourceId,
  leadEmail = null,
  leadPhone = null,
}) {
  const { Op, fn, col, where: whereExpr } = sequelize.Sequelize;
  const out = [];
  if (leadEmail && typeof leadEmail === "string") {
    out.push(
      whereExpr(fn("LOWER", col("lead_email_snapshot")), leadEmail.toLowerCase())
    );
  }
  if (leadPhone && typeof leadPhone === "string" && leadPhone.trim()) {
    out.push({ lead_phone_snapshot: leadPhone.trim() });
  }
  out.push({
    [Op.and]: [
      { lead_source_type: leadSourceType },
      { lead_source_id: String(leadSourceId) },
    ],
  });
  return out;
}

module.exports = { buildIdentityOr };
