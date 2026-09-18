// Unicode combining marks left behind by NFKD, e.g. the accent in "café".
// Written as an escaped RegExp so the range stays legible in source.
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

// Mirrors `toSlug` in tps-next-backend/utils/slugHelpers.js so the UI can preview
// exactly the slug the API will store. Keep the two in sync.
export const toCourseSlug = (value: string): string =>
  value
    .toString()
    .normalize("NFKD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");

// Mirrors `uniqueSlug` in the same backend file: returns `base` when free, else
// the first available `base-2`, `base-3`, ... Callers add the result to `taken`.
export const uniqueCourseSlug = (base: string, taken: Set<string>): string => {
  const root = toCourseSlug(base) || "item";
  if (!taken.has(root)) return root;

  let n = 2;
  while (taken.has(`${root}-${n}`)) n++;
  return `${root}-${n}`;
};
