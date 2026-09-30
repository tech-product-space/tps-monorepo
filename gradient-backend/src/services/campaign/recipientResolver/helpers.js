import { Op } from "sequelize";

/**
 * Shared query helpers for the audience resolvers.
 *
 * Every resolver takes a `filters` object straight out of a campaign's
 * `recipientFilters` JSONB, which means every value in it came from a browser
 * and none of it is trustworthy. These narrow that down to something safe to
 * put in a `where`.
 */

/** An `Op.in` clause, or nothing at all when the filter is absent or empty. */
export const inClause = (values) => {
  if (!Array.isArray(values)) {
    // A single value is accepted so `{ status: "new" }` behaves like
    // `{ status: ["new"] }` rather than silently matching nothing.
    return values === undefined || values === null || values === ""
      ? undefined
      : { [Op.in]: [values] };
  }

  const cleaned = values.filter((v) => v !== null && v !== undefined && v !== "");

  return cleaned.length ? { [Op.in]: cleaned } : undefined;
};

/** Postgres array overlap — for `Resource.tagPrimary` and friends. */
export const overlapClause = (values) => {
  const list = Array.isArray(values) ? values : values ? [values] : [];
  const cleaned = list.filter(Boolean);

  return cleaned.length ? { [Op.overlap]: cleaned } : undefined;
};

/**
 * A `createdAt` (or any date column) range.
 *
 * Both ends optional. An unparseable date is dropped rather than becoming an
 * `Invalid Date`, which Postgres rejects at query time with an error that says
 * nothing useful about which filter caused it.
 */
export const dateRangeClause = (from, to) => {
  const clause = {};

  const parse = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  const start = parse(from);
  const end = parse(to);

  if (start) clause[Op.gte] = start;
  if (end) clause[Op.lte] = end;

  return Object.keys(clause).length || Object.getOwnPropertySymbols(clause).length
    ? clause
    : undefined;
};

/**
 * Drops the keys whose clause came back undefined.
 *
 * Sequelize treats `{ status: undefined }` as `status IS NULL`, so leaving them
 * in would turn "no filter" into "match nothing" — the kind of bug that shows
 * up as a campaign quietly resolving to zero people.
 */
export const compact = (where) => {
  const out = {};

  for (const [key, value] of Object.entries(where)) {
    if (value !== undefined) out[key] = value;
  }

  return out;
};

/** Shapes a row into the one thing every resolver must return. */
export const toRecipient = (sourceType) => (row) => ({
  name: row.name ?? null,
  email: row.email,
  sourceType,
  sourceId: row.id ?? null,
});
