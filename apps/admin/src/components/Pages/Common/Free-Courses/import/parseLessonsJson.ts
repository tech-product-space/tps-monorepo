import type { IBlockBase } from "@/components/block-editor/types/block.types";
import { markdownToBlocks } from "./markdownToBlocks";
import { assignSlugs, type Sluggable } from "./assignSlugs";

export interface ParsedLesson extends Sluggable {
  title: string;
  content: { blocks: IBlockBase[] };
  // What the block model couldn't represent (dropped images, unparseable video
  // links, over-wide tables). Shown in the preview instead of failing silently.
  warnings: string[];
}

export interface ParseLessonsResult {
  lessons: ParsedLesson[];
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

/**
 * Parses pasted lesson JSON. Fail-closed: any malformed entry rejects the whole
 * paste with a reason, rather than importing a partial batch.
 *
 * `existingSlugs` are the slugs already in the target module, used to preview
 * the de-duplication the API performs.
 */
export function parseLessonsJson(
  raw: string,
  existingSlugs: Set<string>,
): ParseLessonsResult {
  const fail = (error: string): ParseLessonsResult => ({ lessons: [], error });

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

  const lessons: ParsedLesson[] = [];

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

    let blocks: IBlockBase[] = [];
    let warnings: string[] = [];

    // "body" is the documented key; accept the obvious aliases an AI might use.
    const body = obj.body ?? obj.content ?? obj.markdown;
    if (body !== undefined && body !== null) {
      if (typeof body === "string") {
        const converted = markdownToBlocks(body);
        blocks = converted.blocks;
        warnings = converted.warnings;
      } else if (
        typeof body === "object" &&
        !Array.isArray(body) &&
        Array.isArray((body as { blocks?: unknown }).blocks)
      ) {
        // Already-structured content passes straight through.
        blocks = (body as { blocks: IBlockBase[] }).blocks;
      } else {
        return fail(
          `${at} has a "body" that is neither a markdown string nor { blocks: [] }.`,
        );
      }
    }

    lessons.push({
      title: title.trim(),
      slugBase:
        typeof obj.slug === "string" && obj.slug.trim() ? obj.slug : title,
      slug: "",
      duplicate: false,
      content: { blocks },
      warnings,
    });
  }

  return { lessons: assignSlugs(lessons, existingSlugs), error: null };
}
