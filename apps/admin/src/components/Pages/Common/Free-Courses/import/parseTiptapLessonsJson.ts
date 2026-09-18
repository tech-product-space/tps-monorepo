import { markdownToTiptapDoc } from "./markdownToTiptapDoc";
import { assignSlugs, type Sluggable } from "./assignSlugs";

export interface ParsedTiptapLesson extends Sluggable {
  title: string;
  content: { doc: Record<string, unknown> };
  // What the conversion couldn't carry across (dropped images, unparseable
  // links). Shown in the preview instead of failing silently.
  warnings: string[];
}

export interface ParseTiptapLessonsResult {
  lessons: ParsedTiptapLesson[];
  // Populated when the payload is unusable; `lessons` is empty in that case.
  error: string | null;
}

// LLMs wrap JSON in code fences despite being told not to. Cheap to forgive.
const stripCodeFences = (raw: string): string =>
  raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

const isTiptapDoc = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  (value as { type?: unknown }).type === "doc";

/**
 * Parses pasted lesson JSON into v2 (Tiptap) lessons. Fail-closed: any malformed
 * entry rejects the whole paste with a reason, rather than importing a partial
 * batch.
 *
 * `existingSlugs` are the slugs already in the target module, used to preview
 * the de-duplication the API performs.
 */
export function parseTiptapLessonsJson(
  raw: string,
  existingSlugs: Set<string>,
): ParseTiptapLessonsResult {
  const fail = (error: string): ParseTiptapLessonsResult => ({
    lessons: [],
    error,
  });

  let data: unknown;
  try {
    data = JSON.parse(stripCodeFences(raw));
  } catch {
    return fail("That isn't valid JSON. Check for a missing comma or quote.");
  }

  if (data && typeof data === "object" && !Array.isArray(data)) {
    data = (data as { lessons?: unknown }).lessons;
  }
  if (!Array.isArray(data)) {
    return fail('Expected an array of lessons, like [{ "title": "..." }].');
  }
  if (data.length === 0) {
    return fail("That array is empty — nothing to import.");
  }

  const lessons: ParsedTiptapLesson[] = [];

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const at = `Lesson ${i + 1}`;

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return fail(`${at} is not an object.`);
    }
    const obj = item as Record<string, unknown>;

    const title = obj.title ?? obj.name;
    if (typeof title !== "string" || !title.trim()) {
      return fail(`${at} is missing a "title".`);
    }
    // The column is STRING(255); the API rejects longer, so catch it here.
    if (title.trim().length > 255) {
      return fail(`${at} has a title longer than 255 characters.`);
    }

    let doc: Record<string, unknown> = {
      type: "doc",
      content: [{ type: "paragraph" }],
    };
    let warnings: string[] = [];

    // "body" is the documented key; accept the obvious aliases an AI might use.
    const body = obj.body ?? obj.content ?? obj.markdown;
    if (body !== undefined && body !== null) {
      if (typeof body === "string") {
        const converted = markdownToTiptapDoc(body);
        doc = converted.doc;
        warnings = converted.warnings;
      } else if (isTiptapDoc(body)) {
        // An already-built document passes straight through.
        doc = body;
      } else if (
        typeof body === "object" &&
        !Array.isArray(body) &&
        isTiptapDoc((body as { doc?: unknown }).doc)
      ) {
        doc = (body as { doc: Record<string, unknown> }).doc;
      } else {
        return fail(
          `${at} has a "body" that is neither a markdown string nor a Tiptap document.`,
        );
      }
    }

    lessons.push({
      title: title.trim(),
      slugBase:
        typeof obj.slug === "string" && obj.slug.trim() ? obj.slug : title,
      slug: "",
      duplicate: false,
      content: { doc },
      warnings,
    });
  }

  return { lessons: assignSlugs(lessons, existingSlugs), error: null };
}
