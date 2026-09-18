// The prompt the admin copies into an AI chat alongside their raw syllabus.
// It is the contract for `parseModulesJson` — keep the two in step.
export const MODULE_AI_PROMPT = `You are a JSON formatter for a course module importer. Convert the course outline I give you into modules in this exact JSON format:

[
  {
    "title": "Getting Started",
    "subtitle": "The fundamentals",
    "overview": "## What you'll learn\\n\\nA short paragraph.\\n\\n- A bullet\\n- Another bullet"
  }
]

Rules:
- Output ONLY the raw JSON array — no markdown code fences, no explanation, no text before or after.
- "title" is required and must be a non-empty string. Keep it under 80 characters.
- "subtitle" is optional — a short one-line description of the module.
- Do NOT include a "slug" — it is generated from the title.
- Do NOT include lessons. This importer creates modules only.
- "overview" is optional and must be a single MARKDOWN string. Supported markdown:
    "## Heading"      starts a new overview section
    "### Subheading"  adds a subheading to the current section
    plain paragraphs
    "- item"          a bullet list
    "- item" with two-space-indented "- item" beneath it for a nested list
- Escape newlines inside "overview" as \\n so the JSON stays valid and parseable.
- Do not use tables, images, links, code blocks or HTML in "overview" — they are stripped.
- Base everything only on the outline I provide — do not invent modules or facts.

Here is the course outline:
`;

export const MODULE_JSON_EXAMPLE = `[
  {
    "title": "Getting Started",
    "subtitle": "The fundamentals",
    "overview": "## What you'll learn\\n\\n- Framing a problem\\n- Talking to users"
  },
  { "title": "Discovery Deep Dive" }
]`;
