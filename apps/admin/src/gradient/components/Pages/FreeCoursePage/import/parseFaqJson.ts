export interface ParsedFaq {
  question: string;
  answer: string;
  /** Already on the course, or repeated earlier in this paste. Not imported. */
  duplicate: boolean;
}

export interface ParseFaqResult {
  faqs: ParsedFaq[];
  // Populated when the payload is unusable; `faqs` is empty in that case.
  error: string | null;
}

// LLMs wrap JSON in code fences despite being told not to. Cheap to forgive.
const stripCodeFences = (raw: string): string =>
  raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

/** Questions match on wording, not punctuation or casing. */
export const normalizeQuestion = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Parses pasted FAQ JSON. Fail-closed: any malformed entry rejects the whole
 * paste with a reason naming the row, rather than importing a partial batch.
 *
 * `existingQuestions` are the normalized questions already on the course.
 * Unlike modules — which the API renames to keep slugs unique — a repeated
 * question has no useful distinct form, so duplicates are flagged and skipped.
 */
export function parseFaqJson(
  raw: string,
  existingQuestions: Set<string>,
): ParseFaqResult {
  const fail = (error: string): ParseFaqResult => ({ faqs: [], error });

  let data: unknown;
  try {
    data = JSON.parse(stripCodeFences(raw));
  } catch {
    return fail("That isn't valid JSON. Check for a missing comma or quote.");
  }

  // Tolerate { "faq": [...] } / { "faqs": [...] } as well as a bare array.
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const wrapper = data as { faq?: unknown; faqs?: unknown };
    data = wrapper.faq ?? wrapper.faqs;
  }
  if (!Array.isArray(data)) {
    return fail('Expected an array of FAQs, like [{ "question": "..." }].');
  }
  if (data.length === 0) {
    return fail("That array is empty — nothing to import.");
  }
  if (data.length > 100) {
    return fail(`That's ${data.length} FAQs. Import at most 100 at a time.`);
  }

  const seen = new Set(existingQuestions);
  const faqs: ParsedFaq[] = [];

  for (let i = 0; i < data.length; i++) {
    const item = data[i];
    const at = `FAQ ${i + 1}`;

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return fail(`${at} is not an object.`);
    }
    const obj = item as Record<string, unknown>;

    // The AI is told question/answer; q/a is a common slip and costs nothing.
    const question = obj.question ?? obj.q;
    if (typeof question !== "string" || !question.trim()) {
      return fail(`${at} is missing a "question".`);
    }

    const answer = obj.answer ?? obj.a;
    if (typeof answer !== "string" || !answer.trim()) {
      return fail(`${at} is missing an "answer".`);
    }

    const normalized = normalizeQuestion(question);
    const duplicate = seen.has(normalized);
    seen.add(normalized);

    faqs.push({
      question: question.trim(),
      answer: answer.trim(),
      duplicate,
    });
  }

  return { faqs, error: null };
}
