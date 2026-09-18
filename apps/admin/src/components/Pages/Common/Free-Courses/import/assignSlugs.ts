import { toCourseSlug, uniqueCourseSlug } from "@/utils/courseSlug";

// Shared by the module and lesson importers.
export interface Sluggable {
  // What the slug derives from: an explicit "slug" in the paste, else the title.
  // Kept so slugs can be recomputed when an item is dropped from the preview.
  slugBase: string;
  slug: string;
  duplicate: boolean;
}

/**
 * Assigns each item the slug the API will give it, mirroring the backend's
 * de-duplication. Re-run whenever the set of items changes so that dropping one
 * frees the slug it was holding.
 *
 * `existingSlugs` are the slugs already on the parent (course or module).
 */
export function assignSlugs<T extends Sluggable>(
  items: T[],
  existingSlugs: Set<string>,
): T[] {
  const taken = new Set(existingSlugs);

  return items.map((item) => {
    const natural = toCourseSlug(item.slugBase);
    const duplicate = taken.has(natural);
    const slug = uniqueCourseSlug(item.slugBase, taken);
    taken.add(slug);
    return { ...item, slug, duplicate };
  });
}
