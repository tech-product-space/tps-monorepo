import db from "../../database/postgres/models/index.js";
import { DEFAULT_MAX_ACTIVE_WORKFLOWS_PER_PERSON } from "../../config/constants/workflow.js";

const { WorkflowSetting } = db;

/**
 * Global workflow policy, cached.
 *
 * Read on **every enrolment attempt** — once per lead that lands anywhere in
 * the product — so it does not get to be a database round trip each time. A
 * 60-second TTL means a change made in the panel takes effect within a minute,
 * which is well inside the tolerance for a setting nobody changes twice a year.
 *
 * Process-local, so a multi-process deploy has each worker warm its own copy.
 * That is fine for the same reason: they converge within the TTL, and the value
 * is a cap rather than a lock.
 *
 * See `WORKFLOW_AUTOMATION_PLAN.md` §4.7 and §8.3.
 */

const TTL_MS = 60 * 1000;

let cache = null;
let cachedAt = 0;

/** Row id 1, always — the table has a check constraint saying so. */
const load = async () => {
  const [row] = await WorkflowSetting.findOrCreate({
    where: { id: 1 },
    defaults: {
      id: 1,
      maxActiveWorkflowsPerPerson: DEFAULT_MAX_ACTIVE_WORKFLOWS_PER_PERSON,
    },
  });

  return row;
};

export const getWorkflowSettings = async () => {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;

  const row = await load();

  cache = {
    maxActiveWorkflowsPerPerson: row.maxActiveWorkflowsPerPerson,
    updatedBy: row.updatedBy,
    updatedAt: row.updatedAt,
  };
  cachedAt = Date.now();

  return cache;
};

export const updateWorkflowSettings = async (updates, { updatedBy } = {}) => {
  const row = await load();

  const next = Number(updates.maxActiveWorkflowsPerPerson);

  if (!Number.isInteger(next) || next < 1) {
    // Zero would silently stop every workflow enrolling anybody while the panel
    // still showed them as active — a kill switch disguised as a setting.
    // Pausing is how you stop a workflow.
    throw Object.assign(new Error("The limit must be a whole number of at least 1"), {
      status: 400,
    });
  }

  await row.update({
    maxActiveWorkflowsPerPerson: next,
    updatedBy: updatedBy ?? null,
  });

  invalidateSettingsCache();

  return row;
};

/** Exported for tests and for the update path; nothing else should need it. */
export const invalidateSettingsCache = () => {
  cache = null;
  cachedAt = 0;
};

/** The defaults the panel shows beside the current value. */
export const WORKFLOW_SETTING_DEFAULTS = Object.freeze({
  maxActiveWorkflowsPerPerson: DEFAULT_MAX_ACTIVE_WORKFLOWS_PER_PERSON,
});
