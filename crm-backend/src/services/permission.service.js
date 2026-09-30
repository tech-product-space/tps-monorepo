'use strict';

const { Op } = require('sequelize');
const { AccessGrant, Product, Subsource } = require('../models');

/**
 * Central permission engine backed by the `access_grants` table.
 *
 * Rules (default-open, deny-wins):
 *   1. No grants for (resourceType, resourceId, action)  -> allowed (default-open).
 *   2. A matching 'deny' grant  -> denied.
 *   3. A matching 'allow' grant -> allowed.
 *   4. Restrictions exist but none match the user -> denied.
 *
 * A grant "matches" a user when its principal is:
 *   - everyone, or
 *   - role   === user.role  (including 'Superadmin'), or
 *   - user   === user.id
 *
 * NOTE: there is NO blanket Superadmin bypass here. A product/subsource can be
 * restricted from Superadmins too, and this operational engine honours that.
 * The ONE thing Superadmins never lose is *management*: the settings listing and
 * the access-CRUD endpoints deliberately do not run through this scope (they are
 * gated by requireRole only), so an admin can always see/undo a restriction —
 * even one that hides a product from them in the leads workspace.
 *
 * `resource_id = NULL` grants are type-wide and apply to every resource of that
 * type (reserved for future defaults; not written by the current UI).
 *
 * Only `action: 'view'` and `effect: 'allow'` are produced by the UI today, but
 * the resolver honours the full model so future actions/deny rules need no code
 * change here.
 */

function grantMatchesUser(grant, user) {
  if (grant.principal_type === 'everyone') return true;
  if (grant.principal_type === 'role') return grant.principal_id === user.role;
  if (grant.principal_type === 'user') {
    return String(grant.principal_id).toLowerCase() === String(user.id).toLowerCase();
  }
  return false;
}

/**
 * Resolve a set of grants (already filtered to one resource + action) against a
 * user. Returns true/false. Assumes `grants` is non-empty.
 */
function resolveGrants(grants, user) {
  const matching = grants.filter((g) => grantMatchesUser(g, user));
  if (matching.some((g) => g.effect === 'deny')) return false;
  if (matching.some((g) => g.effect === 'allow')) return true;
  return false;
}

/**
 * Can `user` perform `action` on a single resource?
 */
async function can(user, { resourceType, resourceId, action = 'view' }) {
  const grants = await AccessGrant.findAll({
    where: {
      resource_type: resourceType,
      action,
      [Op.or]: [{ resource_id: resourceId }, { resource_id: null }],
    },
  });

  if (grants.length === 0) return true; // default-open
  return resolveGrants(grants, user);
}

/**
 * Ids of all resources of a type the user may `action`.
 * Returns `null` to mean "no restriction — all of them" (Superadmin, or when no
 * grants exist at all). Callers treat null as "don't filter".
 */
async function accessibleResourceIds(user, resourceType, action = 'view') {
  const grants = await AccessGrant.findAll({
    where: { resource_type: resourceType, action },
  });
  if (grants.length === 0) return null; // nothing configured -> all open

  // Type-wide grants (resource_id null) affect every resource of this type.
  const typeWide = grants.filter((g) => g.resource_id === null);
  const byResource = new Map();
  for (const g of grants) {
    if (g.resource_id === null) continue;
    if (!byResource.has(g.resource_id)) byResource.set(g.resource_id, []);
    byResource.get(g.resource_id).push(g);
  }

  const Model = resourceType === 'subsource' ? Subsource : Product;
  const rows = await Model.findAll({ attributes: ['id'], paranoid: false });

  const accessible = [];
  for (const row of rows) {
    const specific = byResource.get(row.id) || [];
    const applicable = specific.concat(typeWide);
    // No rule touches this resource -> open. Otherwise resolve.
    if (applicable.length === 0 || resolveGrants(applicable, user)) {
      accessible.push(row.id);
    }
  }
  return accessible;
}

/**
 * Nested check: a subsource is usable only if BOTH its parent product and the
 * subsource itself are accessible.
 */
async function canAccessSubsource(user, subsource, action = 'view') {
  const productOk = await can(user, {
    resourceType: 'product',
    resourceId: subsource.product_id,
    action,
  });
  if (!productOk) return false;
  return can(user, {
    resourceType: 'subsource',
    resourceId: subsource.id,
    action,
  });
}

/**
 * Fetch the raw grants for a resource, grouped into { roles, users } for the
 * settings UI. Only 'allow' grants are surfaced (the UI is allow-only today).
 */
async function getGrantsFor(resourceType, resourceId, action = 'view') {
  const grants = await AccessGrant.findAll({
    where: { resource_type: resourceType, resource_id: resourceId, action, effect: 'allow' },
  });
  return {
    roles: grants.filter((g) => g.principal_type === 'role').map((g) => g.principal_id),
    users: grants.filter((g) => g.principal_type === 'user').map((g) => g.principal_id),
  };
}

/**
 * Replace the full allow-grant set for a resource. Empty roles + users => the
 * resource returns to "open to everyone". Runs in a transaction.
 */
async function setGrantsFor(
  resourceType,
  resourceId,
  { roles = [], users = [], action = 'view', createdBy = null } = {},
) {
  return AccessGrant.sequelize.transaction(async (transaction) => {
    await AccessGrant.destroy({
      where: { resource_type: resourceType, resource_id: resourceId, action, effect: 'allow' },
      transaction,
    });

    const rows = [
      ...roles.map((role) => ({ principal_type: 'role', principal_id: role })),
      ...users.map((uid) => ({ principal_type: 'user', principal_id: String(uid) })),
    ].map((p) => ({
      resource_type: resourceType,
      resource_id: resourceId,
      action,
      effect: 'allow',
      created_by: createdBy,
      ...p,
    }));

    if (rows.length) await AccessGrant.bulkCreate(rows, { transaction });
    return { roles, users };
  });
}

/**
 * Bulk-load access rules for many resources at once, keyed by resource_id, so
 * the settings list can be returned in a single pass. -> { [id]: {roles,users} }
 */
async function getGrantsMap(resourceType, resourceIds, action = 'view') {
  const map = {};
  if (!resourceIds || resourceIds.length === 0) return map;
  const grants = await AccessGrant.findAll({
    where: {
      resource_type: resourceType,
      resource_id: { [Op.in]: resourceIds },
      action,
      effect: 'allow',
    },
  });
  for (const g of grants) {
    if (!map[g.resource_id]) map[g.resource_id] = { roles: [], users: [] };
    if (g.principal_type === 'role') map[g.resource_id].roles.push(g.principal_id);
    if (g.principal_type === 'user') map[g.resource_id].users.push(g.principal_id);
  }
  return map;
}

module.exports = {
  can,
  accessibleResourceIds,
  canAccessSubsource,
  getGrantsFor,
  setGrantsFor,
  getGrantsMap,
};
