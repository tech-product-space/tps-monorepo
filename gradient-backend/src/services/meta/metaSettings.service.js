import db from "../../database/postgres/models/index.js";

const { MetaSettings } = db;

/**
 * The singleton settings row.
 *
 * `services/` here is deliberately thin — it holds only what more than one
 * caller needs. This qualifies: the controllers, the poll job and the sync job
 * all read the same row, and each of them creating it independently is how a
 * fresh database ends up with three.
 */

/**
 * Read, creating the row on first call.
 *
 * Lazy rather than seeded by the migration so a restored dump, a fresh install
 * and a rolled-back migration all converge on the same state. Defaults to
 * polling **on**: an integration that silently does nothing after deploy is a
 * worse failure than one that starts working immediately.
 */
export const getSettings = async () => {
  const existing = await MetaSettings.findOne({ order: [["createdAt", "ASC"]] });

  if (existing) return existing;

  return MetaSettings.create({ pollEnabled: true });
};

export const updateSettings = async (patch = {}) => {
  const settings = await getSettings();

  if (typeof patch.pollEnabled === "boolean") {
    settings.pollEnabled = patch.pollEnabled;
  }

  await settings.save();

  return settings;
};

/** Stamped by the jobs so the panel can show when each last ran. */
export const markPolled = async (at = new Date()) => {
  const settings = await getSettings();
  settings.lastPollAt = at;
  await settings.save();
  return settings;
};

export const markSynced = async (at = new Date()) => {
  const settings = await getSettings();
  settings.lastSyncAt = at;
  await settings.save();
  return settings;
};
