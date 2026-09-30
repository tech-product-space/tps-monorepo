import toSlug from "./slugHelpers.js";

/**
 * Shared validation for the module and lesson bulk importers.
 *
 * Both importers are fail-closed: one bad row rejects the whole batch with a
 * reason naming the row, rather than half-importing and leaving the admin to
 * work out what landed. The admin panel previews the batch before sending, so
 * an error here means the payload was hand-edited or the parser drifted.
 */

const MAX_BATCH = 100;
const MAX_TITLE = 200;

/**
 * Validates the envelope and returns the array, or a message describing why it
 * is unusable.
 */
export const readBatch = (body, key) => {
  const items = body?.[key];

  if (!Array.isArray(items)) {
    return { error: `"${key}" must be an array.` };
  }
  if (items.length === 0) {
    return { error: `"${key}" is empty — nothing to import.` };
  }
  if (items.length > MAX_BATCH) {
    return {
      error: `That batch has ${items.length} items. Import at most ${MAX_BATCH} at a time.`,
    };
  }

  return { items };
};

/**
 * Validates one row's title and derives its slug. `label` names the row in any
 * error message ("Module 3", "Lesson 7").
 */
export const readTitleAndSlug = (item, label) => {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return { error: `${label} is not an object.` };
  }

  const { title } = item;

  if (typeof title !== "string" || !title.trim()) {
    return { error: `${label} is missing a "title".` };
  }
  if (title.trim().length > MAX_TITLE) {
    return {
      error: `${label} has a title longer than ${MAX_TITLE} characters.`,
    };
  }

  // A caller-supplied slug is honoured, but still normalised — the importer
  // must never write a slug the URL layer cannot round-trip.
  const base =
    typeof item.slug === "string" && item.slug.trim() ? item.slug : title;
  const slug = toSlug(base);

  if (!slug) {
    return {
      error: `${label} has a title with no usable characters for a slug.`,
    };
  }

  return { title: title.trim(), slug };
};

/**
 * Suffixes a slug until it is unique within `taken`, which must hold both the
 * slugs already in the database and the ones assigned earlier in this batch.
 * Mutates `taken`, so sequential calls stay consistent.
 */
export const uniqueSlug = (slug, taken) => {
  if (!taken.has(slug)) {
    taken.add(slug);
    return slug;
  }

  let n = 2;
  while (taken.has(`${slug}-${n}`)) n++;

  const result = `${slug}-${n}`;
  taken.add(result);
  return result;
};
