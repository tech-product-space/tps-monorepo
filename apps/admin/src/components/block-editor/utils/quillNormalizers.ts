// Each text block coerces its HTML into the shape that block can actually hold.
// The renderers apply these inside Quill's onChange; blockConvert applies them at
// conversion time. That timing matters: without it, converted HTML sits in the new
// block looking intact until the next keystroke rewrites it.

/** Header holds one line: the first h2/h3, or the first paragraph promoted to h2. */
export function normalizeHeadingHTML(html: string) {
  if (!html) return "";

  // Extract first heading if exists
  const headingMatch = html.match(/<(h2|h3)[^>]*>.*?<\/\1>/i);
  if (headingMatch) return headingMatch[0];

  // Convert first paragraph to h2
  const pMatch = html.match(/<p[^>]*>(.*?)<\/p>/i);
  if (pMatch) return `<h2>${pMatch[1]}</h2>`;

  return "";
}

/** Card's toolbar offers h3/h4 only, so anything larger is demoted. */
export function cleanQuillHTML(html: string) {
  if (!html) return "";

  let cleaned = html;

  // Convert h1 and h2 to h3
  cleaned = cleaned.replace(/<h1([^>]*)>/gi, "<h3$1>");
  cleaned = cleaned.replace(/<\/h1>/gi, "</h3>");
  cleaned = cleaned.replace(/<h2([^>]*)>/gi, "<h3$1>");
  cleaned = cleaned.replace(/<\/h2>/gi, "</h3>");

  return cleaned;
}

const TO_PARAGRAPH = "h1, h2, h3, h4, h5, h6, blockquote, pre";

// Only span.ql-badge — Quill writes colour and background as plain <span style>,
// which Paragraph does support, so a blanket span unwrap would strip those too.
const UNWRAP = "sub, sup, span.ql-badge";

/**
 * Reduces HTML to what Paragraph's `formats` whitelist allows: headings, quotes
 * and code become plain paragraphs, and formats with no Paragraph equivalent are
 * unwrapped to their text. Quill would do this itself on the next edit; doing it
 * here makes the result visible immediately instead.
 */
export function demoteToParagraphHTML(html: string): string {
  if (!html) return "";
  if (typeof DOMParser === "undefined") return html;

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");

  for (const el of Array.from(doc.body.querySelectorAll(UNWRAP))) {
    el.replaceWith(...Array.from(el.childNodes));
  }

  // Attributes carry over so Quill's alignment class survives the swap.
  for (const el of Array.from(doc.body.querySelectorAll(TO_PARAGRAPH))) {
    const p = doc.createElement("p");
    for (const attr of Array.from(el.attributes)) {
      p.setAttribute(attr.name, attr.value);
    }
    p.append(...Array.from(el.childNodes));
    el.replaceWith(p);
  }

  // Indent isn't a Paragraph format, so the class would linger with no toolbar
  // control able to clear it.
  for (const el of Array.from(doc.body.querySelectorAll("[class*='ql-indent-']"))) {
    const next = el.className.replace(/\bql-indent-\d+\b/g, "").replace(/\s+/g, " ").trim();
    if (next) el.setAttribute("class", next);
    else el.removeAttribute("class");
  }

  return doc.body.innerHTML;
}
