import { assignSlugs, type Sluggable } from "@/gradient/components/TiptapEditor/import/slug";

export interface OverviewPoint {
  title: string;
  description: string;
}

export interface ParsedModule extends Sluggable {
  title: string;
  subTitle: string;
  overview: {
    moduleDuration: string;
    moduleDescription: OverviewPoint[];
  };
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
 * paste with a reason naming the row, rather than importing a partial batch.
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

  // Tolerate { "modules": [...] } as well as a bare array.
  if (data && typeof data === "object" && !Array.isArray(data)) {
    data = (data as { modules?: unknown }).modules;
  }
  if (!Array.isArray(data)) {
    return fail('Expected an array of modules, like [{ "title": "..." }].');
  }
  if (data.length === 0) {
    return fail("That array is empty — nothing to import.");
  }
  if (data.length > 100) {
    return fail(`That's ${data.length} modules. Import at most 100 at a time.`);
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

    // Accept subtitle either way — the AI is told subTitle, but the lowercase
    // spelling is a common slip and costs nothing to allow.
    const subTitle = obj.subTitle ?? obj.subtitle;
    if (subTitle !== undefined && typeof subTitle !== "string") {
      return fail(`${at} has a "subTitle" that isn't a string.`);
    }

    if (obj.lessons !== undefined) {
      return fail(
        `${at} contains "lessons". This importer creates modules only — remove them and paste again.`,
      );
    }

    if (obj.duration !== undefined && typeof obj.duration !== "string") {
      return fail(`${at} has a "duration" that isn't a string.`);
    }

    const points: OverviewPoint[] = [];
    if (obj.overview !== undefined && obj.overview !== null) {
      if (!Array.isArray(obj.overview)) {
        return fail(
          `${at} has an "overview" that isn't an array of { title, description } points.`,
        );
      }

      for (let j = 0; j < obj.overview.length; j++) {
        const point = obj.overview[j] as Record<string, unknown>;
        const where = `${at}, overview point ${j + 1}`;

        if (!point || typeof point !== "object" || Array.isArray(point)) {
          return fail(`${where} is not an object.`);
        }
        if (typeof point.title !== "string" || !point.title.trim()) {
          return fail(`${where} is missing a "title".`);
        }
        if (
          point.description !== undefined &&
          typeof point.description !== "string"
        ) {
          return fail(`${where} has a "description" that isn't a string.`);
        }

        points.push({
          title: point.title.trim(),
          description:
            typeof point.description === "string"
              ? point.description.trim()
              : "",
        });
      }
    }

    modules.push({
      title: title.trim(),
      subTitle: typeof subTitle === "string" ? subTitle.trim() : "",
      slugBase:
        typeof obj.slug === "string" && obj.slug.trim() ? obj.slug : title,
      slug: "",
      duplicate: false,
      overview: {
        moduleDuration:
          typeof obj.duration === "string" ? obj.duration.trim() : "",
        moduleDescription: points,
      },
    });
  }

  return { modules: assignSlugs(modules, existingSlugs), error: null };
}
