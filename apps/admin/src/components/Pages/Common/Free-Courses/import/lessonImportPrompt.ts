// The prompt the admin copies into an AI chat alongside their raw material.
// It is the contract for `parseLessonsJson` + `markdownToBlocks` — keep in step.
export const LESSON_AI_PROMPT = `You are a JSON formatter for a course lesson importer. Convert the material I give you into lessons in this exact JSON format:

[
  {
    "title": "What is a PM?",
    "body": "## The role\\n\\nA PM owns the **why**.\\n\\n- Discovery\\n- Delivery"
  }
]

Rules:
- Output ONLY the raw JSON array — no markdown code fences, no explanation, no text before or after.
- "title" is required, a non-empty string, 255 characters or fewer.
- Do NOT include a "slug" — it is generated from the title.
- "body" is optional and must be a single MARKDOWN string. Escape newlines as \\n so the JSON stays valid.

Markdown supported in "body":
    "## Heading"        a section heading
    "### Subheading"    a smaller heading
    plain paragraphs, with **bold**, *italic* and [links](https://example.com)
    "- item"            a bullet list (indent two spaces for one level of nesting)
    "1. item"           a numbered list
    "> text"            a quote block
    "\`\`\`python"        a fenced code block (close it with \`\`\` on its own line)
    a markdown table    (keep it to 5 columns or fewer)
    a YouTube link on its own line       becomes an embedded video
    a direct .mp4 link on its own line   becomes an embedded video

Important:
- Do NOT include images. Images must be uploaded in the editor and will be dropped on import.
- A YouTube link must be a full URL (https://www.youtube.com/watch?v=... or https://youtu.be/...), never a bare video id.
- Do not use HTML — write plain markdown.
- Base everything only on the material I provide — do not invent lessons or facts.

Here is the material:
`;

export const LESSON_JSON_EXAMPLE = `[
  {
    "title": "What is a PM?",
    "body": "## The role\\n\\nA PM owns the **why**.\\n\\n- Discovery\\n- Delivery"
  },
  { "title": "PM vs PO" }
]`;
