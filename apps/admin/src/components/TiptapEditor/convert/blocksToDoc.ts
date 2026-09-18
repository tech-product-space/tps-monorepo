import { generateJSON } from "@tiptap/core";

import { createEditorExtensions } from "../TiptapEditor";
import type { IBlockBase } from "@/components/block-editor/types/block.types";
import { resolveStorageUrl } from "@/lib/stoage";

// One-way conversion of a v1 lesson (`content.blocks`) into the v2 document the
// Tiptap editor stores (`content.doc`).
//
// One way on purpose. Most of the block vocabulary maps cleanly onto a
// ProseMirror node, but `layout` and `card` do not exist in the editor's schema
// at all — there is nowhere for a two-column row or a bordered callout box to
// go. Those are flattened: their children come through in order, the container
// itself does not. That is a real loss of formatting, which is why the caller
// shows these warnings and asks before writing anything.

export interface BlockConversion {
  doc: Record<string, unknown>;
  /** What the document could not carry across, for the confirmation dialog. */
  warnings: string[];
}

/** An empty document still has to be a valid one, or the editor opens broken. */
const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Paragraph and header blocks store Quill HTML. Quill writes `<p>` for a
 * paragraph but leans on `class="ql-*"` for alignment and indentation, none of
 * which the editor's schema knows — those attributes are dropped by
 * `generateJSON` rather than misread, so nothing has to strip them here.
 */
const htmlOf = (block: IBlockBase): string =>
  typeof block.data?.html === "string" ? block.data.html : "";

/** Header blocks carry their level in `data.level`, defaulting to 2. */
const headerHtml = (block: IBlockBase): string => {
  const html = htmlOf(block);
  if (!html.trim()) return "";

  // Already a heading tag (the header block writes one) — leave it be; anything
  // deeper than h3 falls back to a paragraph, which the schema tops out at.
  if (/^\s*<h[1-6][\s>]/i.test(html)) return html;

  const level = Number(block.data?.level) || 2;
  const tag = `h${Math.min(Math.max(level, 1), 3)}`;
  return `<${tag}>${html}</${tag}>`;
};

/**
 * Walks the block tree, emitting HTML the editor's schema can parse.
 *
 * HTML rather than ProseMirror JSON directly: the paragraph blocks are already
 * HTML, so going through `generateJSON` at the end means inline formatting
 * (bold, links, code spans) is parsed by the same code that parses a .docx
 * import, instead of a second hand-written inline converter.
 */
function blockToHtml(
  block: IBlockBase,
  warnings: Set<string>,
): string {
  switch (block.type) {
    case "header":
      return headerHtml(block);

    case "paragraph":
      return htmlOf(block);

    case "table":
      // The table block stores a full <table> already.
      return htmlOf(block);

    case "code": {
      const code = String(block.data?.code ?? "");
      const language = String(block.data?.language || "plaintext");
      if (!code.trim()) return "";
      if (block.data?.filename) {
        warnings.add(
          "Code block filenames are not shown in the new editor — the filename label was dropped.",
        );
      }
      return `<pre><code class="language-${language}">${escapeHtml(code)}</code></pre>`;
    }

    case "image": {
      const key = String(block.data?.key ?? "");
      if (!key) return "";
      const src = resolveStorageUrl(key);
      const alt = escapeHtml(String(block.data?.alt ?? ""));
      const width = block.data?.width ? `${block.data.width}%` : "100%";

      let html = `<img src="${src}" alt="${alt}" style="width: ${width}">`;
      // The image node has no caption attribute; keeping the text as a
      // paragraph loses the styling but never the words.
      const caption = String(block.data?.caption ?? "").trim();
      if (caption) {
        warnings.add(
          "Image captions became ordinary paragraphs under the image.",
        );
        html += `<p>${escapeHtml(caption)}</p>`;
      }
      return html;
    }

    case "youtube": {
      const src = String(block.data?.src ?? "");
      if (!src) return "";
      const loop = block.data?.loop ? ' loop="true"' : "";
      const autoplay = block.data?.autoplay ? ' autoplay="true"' : "";
      return `<div data-type="custom-youtube" src="${escapeHtml(src)}"${loop}${autoplay}></div>`;
    }

    case "video": {
      // An uploaded video is stored as a key; a linked one as a URL.
      const key = String(block.data?.key ?? "");
      const src = key ? resolveStorageUrl(key) : String(block.data?.src ?? "");
      if (!src) return "";

      const thumbKey = String(block.data?.thumbnailKey ?? "");
      const poster = thumbKey
        ? resolveStorageUrl(thumbKey)
        : String(block.data?.thumbnail ?? "");

      const posterAttr = poster ? ` poster="${escapeHtml(poster)}"` : "";
      const loop = block.data?.loop ? ' loop="true"' : "";
      return `<div data-type="custom-video" src="${escapeHtml(src)}"${posterAttr}${loop}></div>`;
    }

    case "card": {
      warnings.add(
        "Card blocks have no equivalent in the new editor — their text was kept, the box around it was not.",
      );
      const own = htmlOf(block);
      const children = childrenHtml(block, warnings);
      return `${own}${children}`;
    }

    case "layout": {
      const columns = Number(block.data?.columns) || 1;
      if (block.data?.layoutType === "grid" || columns > 1) {
        warnings.add(
          "Multi-column layouts have no equivalent in the new editor — the columns were flattened into a single column, top to bottom.",
        );
      }
      return childrenHtml(block, warnings);
    }

    default:
      warnings.add(
        `"${block.type}" blocks have no equivalent in the new editor and were dropped.`,
      );
      return "";
  }
}

const childrenHtml = (block: IBlockBase, warnings: Set<string>): string =>
  (block.children ?? []).map((child) => blockToHtml(child, warnings)).join("");

/**
 * Converts a lesson's blocks into a Tiptap document.
 *
 * Returns the document plus every warning raised along the way, de-duplicated —
 * a lesson with twelve cards should say so once, not twelve times.
 */
export function blocksToDoc(blocks: IBlockBase[] | undefined): BlockConversion {
  const warnings = new Set<string>();

  const html = (blocks ?? [])
    .map((block) => blockToHtml(block, warnings))
    .join("")
    .trim();

  if (!html) {
    return { doc: EMPTY_DOC, warnings: [...warnings] };
  }

  return {
    doc: generateJSON(html, createEditorExtensions()) as Record<
      string,
      unknown
    >,
    warnings: [...warnings],
  };
}
