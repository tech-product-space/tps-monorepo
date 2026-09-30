/**
 * Utility to calculate pagination parameters (page, limit, offset)
 * @param {Object} query - req.query object from Express
 * @param {number} [defaultLimit=10] - Default limit per page
 * @param {number} [maxLimit=50] - Maximum allowed limit
 * @returns {{ page: number, limit: number, offset: number }}
 */
function getPaginationParams(query, defaultLimit = 10, maxLimit = 50) {
  const rawPage = parseInt(query.page, 10);
  const rawLimit = parseInt(query.limit, 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), maxLimit)
    : defaultLimit;

  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Builds pagination metadata for API responses.
 * @param {number} total - Total number of records
 * @param {number} page - Current page number
 * @param {number} limit - Limit per page
 * @returns {Object} - { total, page, limit, totalPages, hasNextPage, hasPrevPage }
 */
const getMeta = (total, page, limit) => {
  const totalPages = Math.ceil(total / limit);

  return {
    total,
    page,
    limit,
    totalPages,
    hasNextPage: page < totalPages,
    hasPrevPage: page > 1,
  };
};

module.exports = { getPaginationParams, getMeta };
