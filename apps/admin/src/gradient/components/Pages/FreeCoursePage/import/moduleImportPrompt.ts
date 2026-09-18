// The prompt an admin copies into an AI chat alongside their raw syllabus.
// It is the contract for `parseModulesJson` — keep the two in step.
export const MODULE_AI_PROMPT = `You are a JSON formatter for a course module importer. Convert the course outline I give you into modules in this exact JSON format:

[
  {
    "title": "Getting Started",
    "subTitle": "The fundamentals",
    "duration": "45 min",
    "overview": [
      { "title": "What you'll learn", "description": "A short paragraph." },
      { "title": "Prerequisites", "description": "Another short paragraph." }
    ]
  }
]

Rules:
- Output ONLY the raw JSON array — no markdown code fences, no explanation, no text before or after.
- "title" is required and must be a non-empty string. Keep it under 200 characters.
- "subTitle" is optional — a short one-line description of the module.
- "duration" is optional — a short human label such as "45 min" or "2 hours".
- "overview" is optional — an array of { "title", "description" } points describing what the module covers. "title" is required on each point, "description" is optional.
- Do NOT include a "slug" — it is generated from the title.
- Do NOT include lessons. This importer creates modules only; lessons are imported separately from a Google Doc.
- Base everything only on the outline I provide — do not invent modules or facts.

Here is the course outline:
`;

export const MODULE_JSON_EXAMPLE = `[
  {
    "title": "Getting Started",
    "subTitle": "The fundamentals",
    "duration": "45 min",
    "overview": [
      { "title": "Framing a problem", "description": "How to scope before you build." }
    ]
  },
  { "title": "Discovery Deep Dive" }
]`;
