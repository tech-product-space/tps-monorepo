"use strict";

const { Op, Sequelize } = require("sequelize");
const { User, Product, sequelize } = require("../models");
const permission = require("./permission.service");
const { ROLES, hasGlobalScope } = require("../config/constants/roles");

/**
 * Shared filter / scoping helpers used by lead list, metrics, export, and
 * follow-up endpoints. Keeping the logic in one place avoids the drift that
 * built up across getLeads / getLeadMetrics / exportLeads / getFollowups.
 */

const DATE_FIELD_ALLOWLIST = new Set([
  "source_created_at",
  "lead_update_date",
  "updated_at",
  "created_at",
  "assigned_at",
]);

const DEFAULT_DATE_FIELD = "source_created_at";

// Fields a client is allowed to sort by. Kept slightly wider than
// DATE_FIELD_ALLOWLIST so non-date sorts (e.g. next_followup) can pass through.
const SORTABLE_FIELDS = new Set([
  "source_created_at",
  "lead_update_date",
  "updated_at",
  "created_at",
  "assigned_at",
  "next_followup",
]);

const DEFAULT_SORT_FIELD = "lead_update_date";

function pickDateField(raw) {
  return DATE_FIELD_ALLOWLIST.has(raw) ? raw : DEFAULT_DATE_FIELD;
}

function pickSortField(raw) {
  return SORTABLE_FIELDS.has(raw) ? raw : DEFAULT_SORT_FIELD;
}

/**
 * Build a Sequelize order clause that always pushes NULLs to the bottom,
 * regardless of ASC/DESC. Critical for nullable columns like assigned_at
 * so unassigned leads don't pile up at the top of "newest first" sorts.
 *
 * The column is qualified with the model alias (`"Lead"`) because the
 * leads query joins LeadProfile / User / Subsource / LeadHistory, all of
 * which also have an `updated_at` (and other shared timestamp columns).
 * An unqualified literal can resolve to the wrong table's column under
 * Postgres's ORDER BY name-resolution rules; qualifying removes any
 * ambiguity. Both inputs are allowlisted, so the literal is injection-safe.
 */
function buildOrderClause(rawSort, rawOrder, modelAlias = "Lead") {
  const sort = pickSortField(rawSort);
  const order = String(rawOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";
  return [
    [Sequelize.literal(`"${modelAlias}"."${sort}" ${order} NULLS LAST`)],
  ];
}

function parseCsv(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

/**
 * Look up lead ids whose history matches an extra_field filter.
 * Used so extra_field searches also catch leads where the value has
 * since been overwritten on the current row.
 */
async function getLeadIdsFromHistory(field, value) {
  const safeField = String(field).replace(/[^a-zA-Z0-9_]/g, "");
  const rows = await sequelize.query(
    `SELECT DISTINCT lead_id FROM lead_history
       WHERE lower(extra_fields->>'${safeField}') LIKE :val`,
    {
      replacements: { val: `%${String(value).toLowerCase()}%` },
      type: sequelize.QueryTypes.SELECT,
    },
  );
  return rows.map((r) => r.lead_id);
}

/**
 * Apply role-based agent scoping to a `where` object in place.
 *
 * - Agent: pinned to their own id, regardless of `agent_id` param.
 * - Manager: limited to themselves + direct reports; `unassigned` allowed.
 * - Superadmin / Program Manager: full visibility; scoped only if `agent_id`
 *   is provided.
 */
async function applyAgentScope(where, user, agentIdParam) {
  const agentIds = parseCsv(agentIdParam).map((id) => id.toLowerCase());

  if (user.role === ROLES.AGENT) {
    where.agent_id = user.id.toLowerCase();
    return;
  }

  if (user.role === ROLES.MANAGER) {
    const subordinates = await User.findAll({
      where: { manager_id: user.id },
      attributes: ["id"],
    });
    const teamIds = [
      user.id.toLowerCase(),
      ...subordinates.map((s) => s.id.toString().toLowerCase()),
    ];

    if (agentIds.length === 0) {
      where[Op.or] = [{ agent_id: { [Op.in]: teamIds } }, { agent_id: null }];
    } else if (agentIds.includes("unassigned")) {
      where[Op.or] = [
        { agent_id: null },
        { agent_id: { [Op.in]: agentIds.filter((id) => teamIds.includes(id)) } },
      ];
    } else {
      where.agent_id = {
        [Op.in]: agentIds.filter((id) => teamIds.includes(id)),
      };
    }
    return;
  }

  if (hasGlobalScope(user.role) && agentIds.length) {
    if (agentIds.includes("unassigned")) {
      where[Op.or] = [
        { agent_id: null },
        { agent_id: { [Op.in]: agentIds.filter((id) => id !== "unassigned") } },
      ];
    } else {
      where.agent_id = { [Op.in]: agentIds };
    }
  }
}

/**
 * Apply CSV-list filters (status / product / subsource) onto `where` in place.
 */
function applyListFilters(where, { status, product, subsource } = {}) {
  if (status) where.status_id = { [Op.in]: parseCsv(status) };
  if (product) where.product_id = { [Op.in]: parseCsv(product) };
  if (subsource) where.subsource_id = { [Op.in]: parseCsv(subsource) };
}

/**
 * Restrict a lead query to the products / subsources the user may access.
 *
 * Enforces the same permission model as the product list, at the data layer, so
 * a restricted user cannot pull another product's leads even by hand-crafting a
 * `product`/`subsource` query param. Superadmin (and fully-open configs) are
 * unaffected. Mutates `where` in place.
 *
 * Subsource rule is nested/null-safe: leads with no subsource stay visible; only
 * leads on an explicitly restricted subsource are filtered out.
 *
 * Applies to Superadmins too — a product restricted from Superadmins hides its
 * leads from them here as well. Default-open products (no grants) leave the
 * scope untouched, so unrestricted setups are unaffected.
 *
 * Archived products are additionally dropped for Agents/Managers only: their
 * leads leave the pipeline (list, search, metrics, export) but stay in each
 * lead's activity/history feed (a separate query, not scoped here) and remain
 * visible to globally-scoped roles operationally.
 */
async function applyProductScope(where, user) {
  if (!user) return;

  const productIds = await permission.accessibleResourceIds(user, "product", "view");
  if (productIds !== null) {
    if (where.product_id && where.product_id[Op.in]) {
      where.product_id = {
        [Op.in]: where.product_id[Op.in].filter((id) => productIds.includes(id)),
      };
    } else {
      where.product_id = { [Op.in]: productIds };
    }
  }

  // Hide archived-product leads from Agents/Managers (global roles keep them).
  if (!hasGlobalScope(user.role)) {
    const archived = await Product.findAll({
      attributes: ["id"],
      where: { deleted_at: { [Op.ne]: null } },
      paranoid: false,
    });
    const archivedIds = archived.map((p) => p.id);
    if (archivedIds.length) {
      if (where.product_id && where.product_id[Op.in]) {
        where.product_id = {
          [Op.in]: where.product_id[Op.in].filter((id) => !archivedIds.includes(id)),
        };
      } else {
        where.product_id = { [Op.notIn]: archivedIds };
      }
    }
  }

  const subsourceIds = await permission.accessibleResourceIds(user, "subsource", "view");
  if (subsourceIds !== null) {
    if (where.subsource_id && where.subsource_id[Op.in]) {
      where.subsource_id = {
        [Op.in]: where.subsource_id[Op.in].filter((id) => subsourceIds.includes(id)),
      };
    } else {
      // Accessible subsources OR leads with no subsource at all.
      where.subsource_id = { [Op.or]: [{ [Op.in]: subsourceIds }, null] };
    }
  }
}

/**
 * Apply extra_fields filters with fallback to lead_history rows so that
 * historical values are also matched. Mutates `where` in place.
 */
async function applyExtraFieldFilters(where, extra) {
  if (!extra || typeof extra !== "object") return;

  for (const [field, value] of Object.entries(extra)) {
    if (!value) continue;
    const safeField = field.replace(/[^a-zA-Z0-9_]/g, "");
    const directFilter = sequelize.where(
      sequelize.fn(
        "lower",
        sequelize.cast(
          sequelize.literal(`extra_fields->>'${safeField}'`),
          "text",
        ),
      ),
      { [Op.like]: `%${String(value).toLowerCase()}%` },
    );
    const historyLeadIds = await getLeadIdsFromHistory(safeField, value);
    where[Op.and] = where[Op.and] || [];
    where[Op.and].push({
      [Op.or]: [
        directFilter,
        ...(historyLeadIds.length
          ? [{ id: { [Op.in]: historyLeadIds } }]
          : []),
      ],
    });
  }
}

/**
 * Apply a date range to whichever column the caller picks (validated against
 * an allowlist). Mutates `where` in place.
 */
function applyDateRange(where, { date_from, date_to, date_field } = {}) {
  if (!date_from && !date_to) return;
  const field = pickDateField(date_field);

  if (date_from && date_to) {
    where[field] = { [Op.between]: [new Date(date_from), new Date(date_to)] };
  } else if (date_from) {
    where[field] = { [Op.gte]: new Date(date_from) };
  } else {
    where[field] = { [Op.lte]: new Date(date_to) };
  }
}

/**
 * Translate the public `followup` query param into a `next_followup` clause.
 * Returns null for unknown values so callers can choose to ignore or 400.
 */
function getFollowUpClause(type) {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  switch (type) {
    case "all":
      return { [Op.not]: null };
    case "today":
      return { [Op.between]: [startOfToday, endOfToday] };
    case "overdue":
      return { [Op.lt]: startOfToday };
    case "upcoming":
      return { [Op.gt]: endOfToday };
    default:
      return null;
  }
}

function applyFollowupFilter(where, followup) {
  if (!followup) return;
  const clause = getFollowUpClause(followup);
  if (clause) where.next_followup = clause;
}

/**
 * Sort order to use when the request was filtered by `followup`.
 * Overdue → most recently overdue first; everything else → soonest first.
 */
function getFollowupOrderClause(followup) {
  switch (followup) {
    case "overdue":
      return [["next_followup", "DESC"]];
    case "today":
    case "upcoming":
    default:
      return [["next_followup", "ASC"]];
  }
}

/**
 * Profile-level search clause (name / email / phone) for use on the
 * LeadProfile include's `where`. Returns undefined when search is blank.
 */
function buildProfileSearchWhere(search) {
  if (!search) return undefined;
  return {
    [Op.or]: [
      { name: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } },
      { phone: { [Op.iLike]: `%${search}%` } },
    ],
  };
}

/**
 * One-shot helper that applies the full Lead filter set used by the list,
 * metrics, and export endpoints. Returns `{ where, profileWhere }`.
 */
async function buildLeadQuery(req, { baseWhere = { is_deleted: false } } = {}) {
  const where = { ...baseWhere };
  const q = req.query || {};

  await applyAgentScope(where, req.user, q.agent_id);
  applyListFilters(where, {
    status: q.status,
    product: q.product,
    subsource: q.subsource,
  });
  await applyProductScope(where, req.user);
  await applyExtraFieldFilters(where, q.extra);
  applyDateRange(where, {
    date_from: q.date_from,
    date_to: q.date_to,
    date_field: q.date_field,
  });
  applyFollowupFilter(where, q.followup);

  return {
    where,
    profileWhere: buildProfileSearchWhere(q.search),
  };
}

module.exports = {
  // Building blocks
  applyAgentScope,
  applyProductScope,
  applyListFilters,
  applyExtraFieldFilters,
  applyDateRange,
  applyFollowupFilter,
  buildProfileSearchWhere,
  // One-shot orchestrator
  buildLeadQuery,
  // Misc helpers
  getLeadIdsFromHistory,
  getFollowUpClause,
  getFollowupOrderClause,
  pickDateField,
  pickSortField,
  buildOrderClause,
  parseCsv,
  DATE_FIELD_ALLOWLIST,
  DEFAULT_DATE_FIELD,
  SORTABLE_FIELDS,
  DEFAULT_SORT_FIELD,
  // Re-exports so callers don't have to import sequelize directly
  Op,
  Sequelize,
};
