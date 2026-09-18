import MarkdownIt from "markdown-it";
import { generateJSON } from "@tiptap/core";

import { createEditorExtensions } from "@/components/TiptapEditor/TiptapEditor";
import { extractYoutubeId } from "@/components/block-editor/utils/youtube";

// Markdown -> HTML -> the ProseMirror JSON a v2 lesson stores.
//
// The markdown dialect is the one `lessonImportPrompt.ts` asks the AI for, so
// the two must stay in step. Everything markdown-it emits maps onto the editor's
// schema already — headings, paragraphs, bold/italic/links, lists, blockquotes,
// tables, code fences — with two exceptions handled here: a bare YouTube or
// .mp4 link on its own line becomes an embedded player, and images are dropped
// because the importer has no bytes to upload for a URL it cannot reach.

export interface MarkdownConversion {
  doc: Record<string, unknown>;
  warnings: string[];
}

/** An empty document still has to be a valid one, or the editor opens broken. */
const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

const md = new MarkdownIt({
  html: false, // the prompt says plain markdown; trusting HTML here would let a paste inject markup
  linkify: true,
  breaks: false,
});

const VIDEO_FILE = /\.(mp4|webm|ogg)(\?.*)?$/i;

/**
 * A paragraph holding nothing but one link, which is how the prompt asks for an
 * embed. Returns the URL, or null when the paragraph is ordinary prose.
 */
const soleLinkUrl = (p: Element): string | null => {
  const text = (p.textContent || "").trim();
  if (!text) return null;

  const anchors = p.querySelectorAll("a");

  // linkify turns a bare URL into an anchor; a hand-written [text](url) is one
  // too. Either way it only counts if the link *is* the whole paragraph.
  if (anchors.length === 1) {
    const href = anchors[0].getAttribute("href") ?? "";
    return anchors[0].textContent?.trim() === text || href === text
      ? href
      : null;
  }

  if (anchors.length === 0 && /^https?:\/\/\S+$/i.test(text)) return text;

  return null;
};

export function markdownToTiptapDoc(markdown: string): MarkdownConversion {
  const warnings: string[] = [];

  if (!markdown.trim()) return { doc: EMPTY_DOC, warnings };

  const doc = new DOMParser().parseFromString(
    md.render(markdown),
    "text/html",
  );

  // Images: the prompt says not to send them, but AIs do anyway. Dropping them
  // loudly beats a lesson full of nodes pointing at URLs that will rot.
  const images = doc.body.querySelectorAll("img");
  if (images.length) {
    warnings.push(
      `${images.length} image${images.length === 1 ? "" : "s"} in the markdown ${images.length === 1 ? "was" : "were"} dropped — add ${images.length === 1 ? "it" : "them"} in the editor.`,
    );
    images.forEach((img) => img.remove());
  }

  for (const p of Array.from(doc.body.querySelectorAll("p"))) {
    const url = soleLinkUrl(p);
    if (!url) continue;

    const youtubeId = extractYoutubeId(url);
    if (youtubeId) {
      const embed = doc.createElement("div");
      embed.setAttribute("data-type", "custom-youtube");
      embed.setAttribute("src", url);
      p.replaceWith(embed);
      continue;
    }

    if (VIDEO_FILE.test(url)) {
      const embed = doc.createElement("div");
      embed.setAttribute("data-type", "custom-video");
      embed.setAttribute("src", url);
      p.replaceWith(embed);
    }
  }

  const html = doc.body.innerHTML.trim();
  if (!html) return { doc: EMPTY_DOC, warnings };

  return {
    doc: generateJSON(html, createEditorExtensions()) as Record<
      string,
      unknown
    >,
    warnings,
  };
}
