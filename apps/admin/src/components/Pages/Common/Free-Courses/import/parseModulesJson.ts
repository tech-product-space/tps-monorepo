import type { ContentSectionData } from "../common/ContentSection";
import { markdownToSections } from "./markdownToSections";
import { assignSlugs, type Sluggable } from "./assignSlugs";

// Re-exported so callers that already import it from here keep working.
export { assignSlugs };

export interface ParsedModule extends Sluggable {
  title: string;
  subtitle: string;
  overview: { sections: ContentSectionData[] };
}

export interface ParseResult {
  modules: ParsedModule[];
  // Populated when the payload is unusable; `modules` is empty in that case.
  error: string | null;
}

// LLMs wrap JSON in code fences despite being told not to. Cheap to forgive.
const stripCodeFences = (raw: string): string =>
  raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

/**
 * Parses pasted module JSON. Fail-closed: any malformed entry rejects the whole
 * paste with a reason, rather than importing a partial batch.
 *
 * `existingSlugs` are the slugs already on the course, used to preview the
 * de-duplication the API performs.
 */
export function parseModulesJson(
  raw: string,
  existingSlugs: Set<string>,
): ParseResult {
  const fail = (error: string): ParseResult => ({ modules: [], error });

  let data: unknown;
  try {
    data = JSON.parse(stripCodeFences(raw));
  } catch {
    return fail("That isn't valid JSON. Check for a missing comma or quote.");
  }

  if (data && typeof data === "object" && !Array.isArray(data)) {
    data = (data as { modules?: unknown }).modules;
  }
  if (!Array.isArray(data)) {
    return fail('Expected an array of modules, like [{ "title": "..." }].');
  }
  if (data.length === 0) {
    return fail("That array is empty — nothing to import.");
  }

  const modules: ParsedModule[] = [];

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const at = `Module ${i + 1}`;

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return fail(`${at} is not an object.`);
    }
    const obj = item as Record<string, unknown>;

    const title = obj.title ?? obj.name;
    if (typeof title !== "string" || !title.trim()) {
      return fail(`${at} is missing a "title".`);
    }

    if (obj.subtitle !== undefined && typeof obj.subtitle !== "string") {
      return fail(`${at} has a "subtitle" that isn't a string.`);
    }

    if (obj.lessons !== undefined) {
      return fail(
        `${at} contains "lessons". This importer creates modules only — remove them and paste again.`,
      );
    }

    let sections: ContentSectionData[] = [];
    if (obj.overview !== undefined && obj.overview !== null) {
      if (typeof obj.overview === "string") {
        sections = markdownToSections(obj.overview);
      } else if (
        typeof obj.overview === "object" &&
        !Array.isArray(obj.overview) &&
        Array.isArray((obj.overview as { sections?: unknown }).sections)
      ) {
        sections = (obj.overview as { sections: ContentSectionData[] }).sections;
      } else {
        return fail(
          `${at} has an "overview" that is neither a markdown string nor { sections: [] }.`,
        );
      }
    }

    modules.push({
      title: title.trim(),
      subtitle: typeof obj.subtitle === "string" ? obj.subtitle.trim() : "",
      slugBase:
        typeof obj.slug === "string" && obj.slug.trim() ? obj.slug : title,
      slug: "",
      duplicate: false,
      overview: { sections },
    });
  }

  return { modules: assignSlugs(modules, existingSlugs), error: null };
}
