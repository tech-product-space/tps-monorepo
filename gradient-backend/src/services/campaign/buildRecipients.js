import { RESOLVERS, isSupportedSourceType } from "./recipientResolver/index.js";
import logger from "../../util/logger.js";

/**
 * Turns a campaign's `recipientFilters` into the list of people to mail.
 *
 *   include → run each source, concatenate, dedupe by lowercased email
 *   exclude → run each source, collect the emails
 *   result  → include minus exclude
 *
 * Exclusion is the half TPS does not have, and it is what makes the ordinary
 * segments expressible: "downloaded the brochure but has not enrolled",
 * "everyone except the people who got last week's send".
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const isValidEmail = (email) =>
  typeof email === "string" && EMAIL_RE.test(email.trim());

const normalise = (email) => String(email).trim().toLowerCase();

/**
 * Accepts either shape.
 *
 * `{ sources: [...] }` is TPS's union-only form and predates this design; a
 * campaign carrying it is read as include-only rather than resolving to nobody.
 */
const readClauses = (filters) => {
  const f = filters || {};

  if (Array.isArray(f.include) || Array.isArray(f.exclude)) {
    return {
      include: Array.isArray(f.include) ? f.include : [],
      exclude: Array.isArray(f.exclude) ? f.exclude : [],
    };
  }

  return {
    include: Array.isArray(f.sources) ? f.sources : [],
    exclude: [],
  };
};

/**
 * Runs one side of the filter set.
 *
 * A resolver that throws takes the whole build down on purpose: a half-resolved
 * audience is worse than a failed one. On the exclude side especially, a
 * swallowed error means people who should have been left out get mailed.
 */
const runClauses = async (clauses, side) => {
  const results = [];

  for (const clause of clauses) {
    const type = clause?.type;

    if (!isSupportedSourceType(type)) {
      throw new Error(
        `Unsupported audience source "${type}" in ${side}. Supported: ${Object.keys(RESOLVERS).join(", ")}`,
      );
    }

    const rows = await RESOLVERS[type](clause.filters || {});

    results.push({ type, rows });
  }

  return results;
};

/**
 * @returns {Promise<{
 *   recipients: Array<{name, email, sourceType, sourceId}>,
 *   stats: { include: Array<{type, rows, unique}>, exclude: Array<{type, rows, unique}>,
 *            totalRows: number, uniqueBeforeExclude: number, excluded: number, mailable: number }
 * }}
 *
 * The stats are not decoration. Resource leads have no capture-time dedupe and
 * a person can appear in four sources, so per-source row counts are not people
 * — and someone deciding whether to send to 4,000 addresses is reading them.
 */
export const buildRecipients = async (recipientFilters) => {
  const { include, exclude } = readClauses(recipientFilters);

  const includeResults = await runClauses(include, "include");
  const excludeResults = await runClauses(exclude, "exclude");

  // ── Include: concatenate, then dedupe keeping the first hit ───────────────
  const byEmail = new Map();
  const includeStats = [];

  for (const { type, rows } of includeResults) {
    let contributed = 0;

    for (const row of rows) {
      if (!isValidEmail(row.email)) continue;

      const email = normalise(row.email);

      if (byEmail.has(email)) continue;

      byEmail.set(email, {
        ...row,
        email,
        name: row.name?.trim() || null,
      });

      contributed++;
    }

    // `rows` counts records matched; `unique` counts people this source added
    // that no earlier source had already contributed.
    includeStats.push({ type, rows: rows.length, unique: contributed });
  }

  const uniqueBeforeExclude = byEmail.size;

  // ── Exclude: collect addresses, then subtract ────────────────────────────
  const blocked = new Set();
  const excludeStats = [];

  for (const { type, rows } of excludeResults) {
    const emails = rows
      .filter((row) => isValidEmail(row.email))
      .map((row) => normalise(row.email));

    // How many of *this* clause's addresses were actually in the audience —
    // the number that answers "did my exclusion do anything". A clause that
    // matches rows but removes nobody is usually a mistake.
    const hits = emails.filter((email) => byEmail.has(email));

    emails.forEach((email) => blocked.add(email));

    excludeStats.push({
      type,
      rows: rows.length,
      unique: new Set(emails).size,
      removed: new Set(hits).size,
    });
  }

  for (const email of blocked) byEmail.delete(email);

  const recipients = [...byEmail.values()];

  const stats = {
    include: includeStats,
    exclude: excludeStats,
    totalRows: includeResults.reduce((sum, r) => sum + r.rows.length, 0),
    uniqueBeforeExclude,
    excluded: uniqueBeforeExclude - recipients.length,
    mailable: recipients.length,
  };

  logger.info("Campaign audience resolved", {
    sources: includeStats.length,
    exclusions: excludeStats.length,
    rows: stats.totalRows,
    unique: uniqueBeforeExclude,
    mailable: stats.mailable,
  });

  return { recipients, stats };
};
