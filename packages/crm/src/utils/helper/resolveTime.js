const dayjs = require("dayjs");
const customParseFormat = require("dayjs/plugin/customParseFormat");

dayjs.extend(customParseFormat);

/**
 * Resolve any time format into a JS Date
 * @param {string|Date|number|null} time
 * @returns {Date|null}
 */
function resolveTime(time, fallback = null) {
  if (!time) return fallback;

  // already Date
  if (time instanceof Date) {
    return isNaN(time.getTime()) ? fallback : time;
  }

  // numeric timestamp
  if (typeof time === "number") {
    const d = new Date(time);
    return isNaN(d.getTime()) ? fallback : d;
  }

  const value = String(time).trim();

  // formats we expect in system
  const formats = [
    "DD MMM YYYY, hh:mm A",     // 13 Sep 2025, 04:44 PM
    "DD MMM YYYY hh:mm A",
    "DD MMM YYYY HH:mm",
    "YYYY-MM-DD HH:mm:ss",
    "YYYY-MM-DDTHH:mm:ssZ",
    "YYYY-MM-DDTHH:mm:ss.SSSZ",
    "YYYY-MM-DD"
  ];

  // strict parsing with known formats
  let parsed = dayjs(value, formats, true);
  if (parsed.isValid()) return parsed.toDate();

  // fallback to dayjs auto parsing (ISO etc.)
  parsed = dayjs(value);
  if (parsed.isValid()) return parsed.toDate();

  return fallback;
}

module.exports = resolveTime;