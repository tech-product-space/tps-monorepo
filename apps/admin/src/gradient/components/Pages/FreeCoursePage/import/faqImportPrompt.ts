// The prompt an admin copies into an AI chat alongside their raw FAQ notes.
// It is the contract for `parseFaqJson` — keep the two in step.
export const FAQ_AI_PROMPT = `You are a JSON formatter for a course FAQ importer. Convert the questions and answers I give you into this exact JSON format:

[
  {
    "question": "Do I need any prior experience?",
    "answer": "No. The course starts from first principles and builds up."
  }
]

Rules:
- Output ONLY the raw JSON array — no markdown code fences, no explanation, no text before or after.
- "question" is required and must be a non-empty string. Keep it under 300 characters.
- "answer" is required and must be a non-empty string. Plain text only — no HTML or markdown.
- Keep each answer to a short paragraph or two. Do not use bullet lists.
- Keep the questions in the order they should appear on the course page.
- Base everything only on the notes I provide — do not invent questions or facts.

Here are the FAQ notes:
`;

export const FAQ_JSON_EXAMPLE = `[
  {
    "question": "Do I need any prior experience?",
    "answer": "No. The course starts from first principles."
  },
  {
    "question": "How long do I have access?",
    "answer": "Access does not expire once you enrol."
  }
]`;
