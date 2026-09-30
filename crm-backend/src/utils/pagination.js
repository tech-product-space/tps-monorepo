/**
 * Shared pagination helpers.
 *
 * Wire contract across the API is always `page` + `limit` query params
 * (`offset` is derived server-side, never sent by clients). Every paginated
 * endpoint returns the same envelope: `{ data, pagination }`, optionally with
 * sibling keys (e.g. `counts`) merged alongside.
 */

/**
 * Parse and clamp pagination query params.
 * @param {object} query - typically `req.query`
 * @param {object} [opts]
 * @param {number} [opts.defaultLimit=50] - limit when none/invalid is supplied
 * @param {number} [opts.maxLimit=100] - hard upper bound on limit
 * @returns {{ page: number, limit: number, offset: number }}
 */
function parsePagination(query = {}, { defaultLimit = 50, maxLimit = 100 } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

/**
 * Build the standard paginated response envelope.
 * @param {object} args
 * @param {Array} args.rows - the page of records
 * @param {number} args.count - total record count across all pages
 * @param {number} args.page - current page (1-based)
 * @param {number} args.limit - page size used for the query
 * @param {object} [extra] - sibling keys merged into the response (e.g. { counts })
 * @returns {{ data: Array, pagination: object }}
 */
function buildPage({ rows, count, page, limit }, extra = {}) {
  const total = Number(count) || 0;
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    data: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
    ...extra,
  };
}

module.exports = { parsePagination, buildPage };
