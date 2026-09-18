/**
 * "Is this document the one we loaded?" — the question every editor screen with
 * an unsaved-changes prompt has to answer.
 *
 * **It cannot be answered with `JSON.stringify`.** The two documents being
 * compared take different routes to get here: one comes back from Postgres,
 * where `jsonb` **re-orders object keys** as it stores them, and the other comes
 * straight out of Tiptap. A stored text node reads
 * `{"text":"Hi","type":"text","marks":[…]}` while the editor emits
 * `{"type":"text","marks":[…],"text":"Hi"}` — the same node, two different
 * strings. Comparing the strings marks every document with a single bold word as
 * edited the moment it loads, so switching between steps or lessons stops to ask
 * about changes nobody made.
 *
 * So: compare structurally, ignoring key order. Nothing else is normalised —
 * a comparison that forgave differences in attrs or marks would start losing
 * real edits, which is a much worse failure than one spurious prompt.
 */

/** Deep equality that does not care what order the keys were written in. */
const deepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;

  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    return a.every((value, i) => deepEqual(value, b[i]));
  }

  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
    return false;
  }

  const aKeys = Object.keys(a as Record<string, unknown>);
  const bKeys = Object.keys(b as Record<string, unknown>);
  if (aKeys.length !== bKeys.length) return false;

  return aKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(b, key) &&
      deepEqual(
        (a as Record<string, unknown>)[key],
        (b as Record<string, unknown>)[key],
      ),
  );
};

/** A doc with nothing in it, however it happens to be spelled. */
export const isEmptyContent = (content: unknown): boolean => {
  if (!content || typeof content !== "object") return true;

  const nodes = (content as { content?: unknown }).content;
  if (!Array.isArray(nodes) || nodes.length === 0) return true;

  return nodes.every(
    (node) =>
      node?.type === "paragraph" &&
      (!node.content || node.content.length === 0),
  );
};

/**
 * Whether two stored/emitted documents are the same.
 *
 * The empty case is special because the two sides genuinely disagree on how to
 * spell it: a row saved with no content at all comes back as `{}`, while the
 * editor renders — and emits — one blank paragraph.
 */
export const isSameContent = (a: unknown, b: unknown): boolean => {
  if (isEmptyContent(a) && isEmptyContent(b)) return true;
  return deepEqual(a, b);
};
