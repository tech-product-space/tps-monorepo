// Shared shape, validation and import helpers for the blog quiz builder.
// The quiz is stored on its own `quiz` JSONB column and scored client-side on
// the public site, so everything persisted here has to be renderable as-is.

import { z } from "zod";

import type { BlogQuiz, QuizQuestion } from "@/gradient/services/blogService";

export const OPTION_COUNT = 4;

export const emptyQuizQuestion = (): QuizQuestion => ({
  id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
  question: "",
  options: Array.from({ length: OPTION_COUNT }, () => ""),
  answerIndex: 0,
});

// Pads/trims a stored question to the fixed number of option inputs the form
// renders, so older rows with 2 or 3 options still open cleanly.
const toFormQuestion = (question: QuizQuestion): QuizQuestion => {
  const options = Array.from(
    { length: OPTION_COUNT },
    (_, i) => question.options?.[i] ?? "",
  );

  return {
    id: question.id || emptyQuizQuestion().id,
    question: question.question ?? "",
    options,
    answerIndex:
      Number.isInteger(question.answerIndex) &&
      question.answerIndex >= 0 &&
      question.answerIndex < OPTION_COUNT
        ? question.answerIndex
        : 0,
  };
};

export const initQuiz = (quiz?: BlogQuiz): BlogQuiz => ({
  enabled: Boolean(quiz?.enabled),
  questions: Array.isArray(quiz?.questions)
    ? quiz.questions.map(toFormQuestion)
    : [],
});

// ─── Schema ───────────────────────────────────────────────────────────────────

const quizQuestionSchema = z
  .object({
    id: z.string(),
    question: z.string().trim().min(1, "Question is required"),
    options: z.array(z.string()),
    answerIndex: z.coerce.number(),
  })
  .superRefine((question, ctx) => {
    const filled = question.options.filter((option) => option.trim());

    if (filled.length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["options"],
        message: "Add at least two options",
      });
    }

    if (!question.options[question.answerIndex]?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["answerIndex"],
        message: "Select which option is the correct answer",
      });
    }
  });

export const quizFormSchema = z
  .object({
    enabled: z.boolean(),
    questions: z.array(quizQuestionSchema),
  })
  .superRefine((quiz, ctx) => {
    if (quiz.enabled && quiz.questions.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["questions"],
        message: "Add at least one question, or turn the quiz off",
      });
    }
  });

export type QuizFormValues = z.infer<typeof quizFormSchema>;

// Trims everything and drops the trailing blank option slots, so the public
// page never has to guess which options are real.
export function cleanQuiz(values: QuizFormValues): BlogQuiz {
  const questions = values.questions.map((question) => {
    const trimmed = question.options.map((option) => option.trim());
    const lastFilled = trimmed.reduce(
      (last, option, i) => (option ? i : last),
      -1,
    );

    return {
      id: question.id,
      question: question.question.trim(),
      options: trimmed.slice(0, lastFilled + 1),
      answerIndex: question.answerIndex,
    };
  });

  return { enabled: values.enabled && questions.length > 0, questions };
}

// ─── JSON import ──────────────────────────────────────────────────────────────

export const QUIZ_AI_PROMPT = `You are a JSON formatter for a blog quiz importer. Convert the content I give you into multiple-choice quiz questions in this exact JSON format:

[
  {
    "question": "...",
    "options": ["option 1", "option 2", "option 3", "option 4"],
    "answerIndex": 0
  }
]

Rules:
- Output ONLY the raw JSON array — no markdown code fences, no explanation, no text before or after.
- Every item must have exactly three keys: "question" (non-empty string), "options" (array of 2 to 4 non-empty strings), and "answerIndex" (0-based number pointing to the correct option).
- Prefer exactly 4 options per question, with one clearly correct answer and plausible distractors.
- Plain text only — no HTML, no markdown, no line breaks inside strings.
- Escape quotes properly so the JSON is valid and parseable.
- Base questions only on the content I provide — do not invent facts. Aim for 5–8 questions covering its key points.

Here is the content:
`;

export const QUIZ_JSON_EXAMPLE = `[
  {
    "question": "What does MVP stand for?",
    "options": ["Most Valuable Product", "Minimum Viable Product", "Maximum Value Proposition", "Minimum Valuable Plan"],
    "answerIndex": 1
  }
]`;

// Accepts a JSON array of {question, options[], answerIndex} (or "answer" as
// the correct option's text), or an object wrapping it as { questions: [...] }.
// Returns null if anything is malformed.
export function parseQuizJson(raw: string): QuizQuestion[] | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (data && typeof data === "object" && !Array.isArray(data)) {
    data = (data as { questions?: unknown }).questions;
  }
  if (!Array.isArray(data)) return null;

  const questions: QuizQuestion[] = [];

  for (const item of data) {
    if (!item || typeof item !== "object") return null;
    const obj = item as Record<string, unknown>;

    const question = typeof obj.question === "string" ? obj.question.trim() : "";
    if (!question) return null;

    if (!Array.isArray(obj.options)) return null;
    const options = obj.options.map((option) =>
      typeof option === "string" ? option.trim() : "",
    );
    if (
      options.length < 2 ||
      options.length > OPTION_COUNT ||
      options.some((option) => !option)
    ) {
      return null;
    }

    let answerIndex = -1;
    if (typeof obj.answerIndex === "number") {
      answerIndex = obj.answerIndex;
    } else if (typeof obj.answer === "string") {
      const answer = obj.answer.trim().toLowerCase();
      answerIndex = options.findIndex(
        (option) => option.toLowerCase() === answer,
      );
    }
    if (
      !Number.isInteger(answerIndex) ||
      answerIndex < 0 ||
      answerIndex >= options.length
    ) {
      return null;
    }

    questions.push({
      ...emptyQuizQuestion(),
      question,
      options: Array.from(
        { length: OPTION_COUNT },
        (_, i) => options[i] ?? "",
      ),
      answerIndex,
    });
  }

  return questions.length > 0 ? questions : null;
}
