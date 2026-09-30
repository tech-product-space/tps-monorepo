import {
  ACTIVITY_LIMITS,
  ACTIVITY_REDACT_KEYS,
} from "../../config/constants/activityLog.js";

const REDACTED = "[redacted]";

const isPlainObject = (value) =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  !(value instanceof Date) &&
  !Buffer.isBuffer(value);

const isRedactedKey = (key) =>
  ACTIVITY_REDACT_KEYS.includes(String(key).toLowerCase());

const formatBytes = (bytes) =>
  bytes >= 1024 ? `${(bytes / 1024).toFixed(1)} KB` : `${bytes} B`;

/**
 * Deep-strips secrets. Runs before anything else, so a redacted value can never
 * reach the truncator, the diff, or the database.
 */
export const redact = (value, depth = 0) => {
  if (depth > 6) return "[too deep]";

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  if (isPlainObject(value)) {
    const out = {};

    for (const [key, val] of Object.entries(value)) {
      out[key] = isRedactedKey(key) ? REDACTED : redact(val, depth + 1);
    }

    return out;
  }

  return value;
};

/**
 * Shrinks a value to something worth storing.
 *
 * The important case is long text: blog bodies and email template HTML are tens
 * of kilobytes each, and storing them verbatim would make `changes` the largest
 * column in the database within a week. They become "<html, 48.2 KB>" — enough
 * to see that the content changed, without keeping a second copy of it.
 */
export const summariseValue = (value) => {
  if (value === null || value === undefined) return value;

  if (Buffer.isBuffer(value)) {
    return `<binary, ${formatBytes(value.length)}>`;
  }

  if (value instanceof Date) return value.toISOString();

  if (typeof value === "string") {
    if (value.length <= ACTIVITY_LIMITS.MAX_STRING) return value;

    const bytes = Buffer.byteLength(value, "utf8");
    const looksLikeHtml = /<\/?[a-z][\s\S]*>/i.test(value.slice(0, 200));

    return `<${looksLikeHtml ? "html" : "text"}, ${formatBytes(bytes)}>`;
  }

  if (Array.isArray(value)) {
    return `<${value.length} item${value.length === 1 ? "" : "s"}>`;
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    return `<object, ${keys.length} field${keys.length === 1 ? "" : "s"}>`;
  }

  return value;
};

const equal = (a, b) => {
  if (a === b) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a === null || b === null || a === undefined || b === undefined) {
    return a === b;
  }
  if (typeof a === "object" && typeof b === "object") {
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
};

/**
 * Shallow field diff, recursing `MAX_DIFF_DEPTH` levels into plain objects.
 *
 * One level of recursion is what makes the JSONB columns readable: without it a
 * pricing tweak logs as "pricing: <object, 9 fields> → <object, 9 fields>";
 * with it, "pricing.earlyBirdPrice: 14999 → 12999".
 *
 * @returns {Object} { "<path>": { from, to } }
 */
export const buildChanges = (before, after, depth = 0, prefix = "") => {
  const changes = {};

  if (!isPlainObject(before) || !isPlainObject(after)) return changes;

  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;

    if (isRedactedKey(key)) {
      // Record that it changed without recording either value.
      if (!equal(before[key], after[key])) {
        changes[path] = { from: REDACTED, to: REDACTED };
      }
      continue;
    }

    const from = before[key];
    const to = after[key];

    if (equal(from, to)) continue;

    if (
      depth < ACTIVITY_LIMITS.MAX_DIFF_DEPTH &&
      isPlainObject(from) &&
      isPlainObject(to)
    ) {
      Object.assign(changes, buildChanges(from, to, depth + 1, path));
      continue;
    }

    changes[path] = { from: summariseValue(from), to: summariseValue(to) };
  }

  return changes;
};

/**
 * Applies `summariseValue` to every value in a `{ field: { from, to } }` map.
 *
 * `buildChanges` already summarises, but a caller can hand-build a diff (or pass
 * a raw request body), and without this the byte cap would drop the oversized
 * field entirely — losing the fact that it changed at all. Summarising first
 * means the cap is a last resort rather than the normal path for long text.
 */
export const summariseChanges = (changes) => {
  if (!isPlainObject(changes)) return {};

  const out = {};

  for (const [field, value] of Object.entries(changes)) {
    if (isPlainObject(value) && ("from" in value || "to" in value)) {
      out[field] = {
        from: summariseValue(value.from),
        to: summariseValue(value.to),
      };
      continue;
    }

    out[field] = summariseValue(value);
  }

  return out;
};

/** Shallow summarise for the flat metadata blob. */
export const summariseMetadata = (metadata) => {
  if (!isPlainObject(metadata)) return {};

  return Object.fromEntries(
    Object.entries(metadata).map(([key, value]) => [
      key,
      isPlainObject(value) || Array.isArray(value)
        ? redact(value)
        : summariseValue(value),
    ]),
  );
};

/**
 * Drops keys until the serialised object fits `maxBytes`, recording how many
 * were dropped so a truncated diff never looks like a complete one.
 */
export const capBytes = (obj, maxBytes) => {
  if (!isPlainObject(obj)) return {};

  let out = obj;
  let serialised;

  try {
    serialised = JSON.stringify(out);
  } catch {
    return { _error: "unserialisable" };
  }

  if (Buffer.byteLength(serialised, "utf8") <= maxBytes) return out;

  const entries = Object.entries(obj);
  out = {};
  let dropped = 0;

  for (const [key, value] of entries) {
    const candidate = { ...out, [key]: value };

    if (Buffer.byteLength(JSON.stringify(candidate), "utf8") > maxBytes) {
      dropped += 1;
      continue;
    }

    out = candidate;
  }

  if (dropped > 0) out._truncated = `${dropped} field(s) omitted`;

  return out;
};

/**
 * Plain snapshot of selected fields, for the snapshot → update → diff pattern.
 * Values are cloned so a later `instance.update()` cannot mutate them in place
 * (which would silently produce an empty diff for JSONB fields).
 */
export const snapshot = (instance, fields) => {
  if (!instance) return {};

  const plain =
    typeof instance.get === "function"
      ? instance.get({ plain: true })
      : instance;

  const out = {};

  for (const field of fields) {
    const value = plain[field];

    out[field] =
      value !== null && typeof value === "object" && !(value instanceof Date)
        ? structuredClone(value)
        : value;
  }

  return out;
};
