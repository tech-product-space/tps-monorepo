/**
 * Parses a date range from query params and returns `{from, to}` plus the
 * previous equivalent window for delta comparisons.
 *
 * Defaults to last 7 days if no params provided.
 */
function parseRange(query) {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

  const spanMs = to.getTime() - from.getTime();
  const previous = {
    from: new Date(from.getTime() - spanMs),
    to: new Date(from.getTime()),
  };

  return { current: { from, to }, previous, span_ms: spanMs };
}

/**
 * Computes the delta percentage between current and previous values.
 * Returns null when previous is 0 (can't divide).
 */
function deltaPct(current, previous) {
  if (previous === 0 || previous === null || previous === undefined) return null;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

module.exports = { parseRange, deltaPct };
