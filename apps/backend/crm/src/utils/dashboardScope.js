const { Op } = require('sequelize');
const { User } = require('../models');
const { ROLES, hasGlobalScope } = require('../config/constants/roles');

/**
 * Returns the set of user ids this caller is allowed to see lead/activity data for.
 *
 * - Superadmin / Program Manager: null (no restriction)
 * - Manager:                      self + all subordinates (users where manager_id = self.id)
 * - Agent:                        self only
 *
 * Pass an optional override_manager_id to view "as" a specific manager
 * (org-wide drill-through).
 *
 * Note the fallback: any role not handled explicitly is scoped to itself. That
 * keeps an unrecognised role safe (sees nothing) rather than leaking the org.
 */
async function getScopedUserIds(user, { override_manager_id } = {}) {
  if (hasGlobalScope(user.role) && !override_manager_id) {
    return null; // unrestricted
  }

  if (hasGlobalScope(user.role) && override_manager_id) {
    const subs = await User.findAll({
      where: { manager_id: override_manager_id },
      attributes: ['id'],
    });
    return [override_manager_id.toLowerCase(), ...subs.map((s) => s.id.toLowerCase())];
  }

  if (user.role === ROLES.MANAGER) {
    const subs = await User.findAll({
      where: { manager_id: user.id },
      attributes: ['id'],
    });
    return [user.id.toLowerCase(), ...subs.map((s) => s.id.toLowerCase())];
  }

  return [user.id.toLowerCase()];
}

/**
 * Applies the role-scoped agent_id filter to a Sequelize `where` clause.
 * Mutates and returns the where object.
 */
function applyAgentScope(where, scopedUserIds, { include_unassigned = true } = {}) {
  if (scopedUserIds === null) return where; // globally-scoped role sees all

  if (include_unassigned) {
    where[Op.or] = [
      { agent_id: { [Op.in]: scopedUserIds } },
      { agent_id: null },
    ];
  } else {
    where.agent_id = { [Op.in]: scopedUserIds };
  }
  return where;
}

module.exports = { getScopedUserIds, applyAgentScope };
