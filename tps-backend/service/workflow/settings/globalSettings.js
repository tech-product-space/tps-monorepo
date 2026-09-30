"use strict";

const { WorkflowGlobalSetting } = require("../../../models");

// In-process cache so hot paths (enrollment-cap check) don't hit Postgres
// on every request. We invalidate on writes; the TTL is a safety net for
// multi-instance deploys where another process might update the row.
const CACHE_TTL_MS = 60 * 1000;
let cache = null;
let cacheLoadedAt = 0;
let pendingLoad = null;

const SINGLETON_ID = 1;

// Hard-coded fallback used if the settings row is missing entirely (e.g. the
// migration hasn't been applied yet). One lead = one workflow at a time.
const DEFAULT_MAX_ACTIVE_WORKFLOWS_PER_LEAD = 1;

function isFresh() {
  return cache && Date.now() - cacheLoadedAt < CACHE_TTL_MS;
}

async function loadFromDb() {
  const row = await WorkflowGlobalSetting.findByPk(SINGLETON_ID);
  if (row) {
    cache = row.toJSON();
  } else {
    const created = await WorkflowGlobalSetting.create({
      id: SINGLETON_ID,
      max_active_workflows_per_lead: DEFAULT_MAX_ACTIVE_WORKFLOWS_PER_LEAD,
    });
    cache = created.toJSON();
  }
  cacheLoadedAt = Date.now();
  return cache;
}

async function getGlobalSettings() {
  if (isFresh()) return cache;
  if (pendingLoad) return pendingLoad;
  pendingLoad = loadFromDb().finally(() => {
    pendingLoad = null;
  });
  return pendingLoad;
}

async function updateGlobalSettings(patch, updatedBy = null) {
  const row =
    (await WorkflowGlobalSetting.findByPk(SINGLETON_ID)) ||
    (await WorkflowGlobalSetting.create({
      id: SINGLETON_ID,
      max_active_workflows_per_lead: DEFAULT_MAX_ACTIVE_WORKFLOWS_PER_LEAD,
    }));

  const next = {};
  if ("max_active_workflows_per_lead" in patch) {
    const v = patch.max_active_workflows_per_lead;
    const n = typeof v === "number" ? v : parseInt(v, 10);
    if (!Number.isInteger(n) || n < 1) {
      const err = new Error(
        "max_active_workflows_per_lead must be a positive integer (1 or more)"
      );
      err.statusCode = 400;
      throw err;
    }
    next.max_active_workflows_per_lead = n;
  }
  if (updatedBy) next.updated_by = updatedBy;

  await row.update(next);

  cache = row.toJSON();
  cacheLoadedAt = Date.now();
  return cache;
}

function invalidateCache() {
  cache = null;
  cacheLoadedAt = 0;
}

module.exports = {
  getGlobalSettings,
  updateGlobalSettings,
  invalidateCache,
  DEFAULT_MAX_ACTIVE_WORKFLOWS_PER_LEAD,
};
