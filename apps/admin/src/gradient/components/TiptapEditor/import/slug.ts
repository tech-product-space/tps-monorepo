// Mirrors toSlug in the backend's util/helpers/slugHelpers.js. Kept in step so
// the import preview shows the slug the API will actually assign.
export const toSlug = (value = ""): string =>
  value
    .toString()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");

export interface Sluggable {
  // What the slug derives from: an explicit "slug" in the paste, else the title.
  // Kept so slugs can be recomputed when an item is dropped from the preview.
  slugBase: string;
  slug: string;
  duplicate: boolean;
}

/**
 * Assigns each item the slug the API will give it, mirroring the backend's
 * de-duplication in util/helpers/importBatch.js. Re-run whenever the set of
 * items changes, so dropping one frees the slug it was holding.
 *
 * `existingSlugs` are the slugs already on the parent course or module.
 */
export function assignSlugs<T extends Sluggable>(
  items: T[],
  existingSlugs: Set<string>,
): T[] {
  const taken = new Set(existingSlugs);

  return items.map((item) => {
    const natural = toSlug(item.slugBase);
    const duplicate = taken.has(natural);

    let slug = natural;
    if (taken.has(slug)) {
      let n = 2;
      while (taken.has(`${natural}-${n}`)) n++;
      slug = `${natural}-${n}`;
    }
    taken.add(slug);

    return { ...item, slug, duplicate };
  });
}
