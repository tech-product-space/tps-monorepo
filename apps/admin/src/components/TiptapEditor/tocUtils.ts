// Shared slug + table-of-contents helpers for the v2 Tiptap editor.
// IMPORTANT: `slugify` must stay byte-for-byte identical to the public site's
// slugify (product-space-next-ui .../BlogDetailPage/utils.ts) so that the
// anchor ids generated here match the ids the public renderer assigns to
// headings — otherwise TOC links won't scroll.

export interface TocItem {
  id: string;
  level: number;
  textContent: string;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/&[a-z]+;/g, " ")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// Recursively concatenate the text of a ProseMirror/Tiptap JSON node.
function nodeText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { text?: string; content?: unknown[] };
  if (typeof n.text === "string") return n.text;
  if (Array.isArray(n.content)) return n.content.map(nodeText).join("");
  return "";
}

// Walk a Tiptap JSON document and produce the table of contents from the
// H2 headings only, assigning deterministic, de-duplicated slug ids.
export function buildTocFromDoc(doc: unknown): TocItem[] {
  const toc: TocItem[] = [];
  const seen = new Set<string>();

  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as {
      type?: string;
      attrs?: { level?: number };
      content?: unknown[];
    };

    if (n.type === "heading" && n.attrs?.level === 2) {
      const text = nodeText(n).trim();
      const base = slugify(text);
      if (text && base) {
        let unique = base;
        let counter = 2;
        while (seen.has(unique)) unique = `${base}-${counter++}`;
        seen.add(unique);
        toc.push({ id: unique, level: 2, textContent: text });
      }
    }

    if (Array.isArray(n.content)) n.content.forEach(walk);
  };

  walk(doc);
  return toc;
}
