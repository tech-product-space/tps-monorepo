// Shared shape, validation and import helpers for the blog FAQ builder.
// Mirrors the quiz tab's `quizForm.ts` so both tabs behave the same way.

import { z } from "zod";

import type { FaqItem } from "@/gradient/services/blogService";

// ─── Schema ───────────────────────────────────────────────────────────────────

const faqItemSchema = z.object({
  index: z.coerce.number(),
  question: z.string().min(1, "Question is required"),
  answer: z.string().min(1, "Answer is required"),
});

export const faqFormSchema = z.object({
  faq: z.array(faqItemSchema),
});

export type FaqFormValues = z.infer<typeof faqFormSchema>;

// ─── JSON import ──────────────────────────────────────────────────────────────

export const FAQ_AI_PROMPT = `You are a JSON formatter for a blog FAQ importer. Convert the content I give you into frequently asked questions in this exact JSON format:

[
  {
    "question": "...",
    "answer": "..."
  }
]

Rules:
- Output ONLY the raw JSON array — no markdown code fences, no explanation, no text before or after.
- Every item must have exactly two keys: "question" (non-empty string) and "answer" (non-empty string).
- Write the question the way a reader would actually ask it, and keep each answer to 1–3 sentences.
- Plain text only — no HTML, no markdown, no line breaks inside strings.
- Escape quotes properly so the JSON is valid and parseable.
- Base the questions only on the content I provide — do not invent facts. Aim for 5–8 questions covering its key points.

Here is the content:
`;

export const FAQ_JSON_EXAMPLE = `[
  {
    "question": "How long does the course take to complete?",
    "answer": "Most learners finish in 8 to 10 weeks, spending around 5 hours a week."
  }
]`;

// Accepts a JSON array of {question, answer}, or an object wrapping it as
// { faq: [...] } / { faqs: [...] }. Returns null if anything is malformed.
export function parseFaqJson(raw: string): FaqItem[] | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (data && typeof data === "object" && !Array.isArray(data)) {
    const wrapper = data as { faq?: unknown; faqs?: unknown };
    data = wrapper.faq ?? wrapper.faqs;
  }
  if (!Array.isArray(data)) return null;

  const items: FaqItem[] = [];

  for (const item of data) {
    if (!item || typeof item !== "object") return null;
    const obj = item as Record<string, unknown>;

    const question = typeof obj.question === "string" ? obj.question.trim() : "";
    const answer = typeof obj.answer === "string" ? obj.answer.trim() : "";
    if (!question || !answer) return null;

    // `index` is assigned on append so imported rows land after existing ones.
    items.push({ index: items.length, question, answer });
  }

  return items.length > 0 ? items : null;
}
