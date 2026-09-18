import { generateJSON } from "@tiptap/html";

import { IMPORT_EXTENSIONS } from "@/gradient/components/TiptapEditor/importExtensions";
import { extractCodeBlocks } from "@/gradient/components/TiptapEditor/import/codeBlocks";
import {
  docxToHtml,
  removeSkippedImages,
  type DocxEntityType,
} from "@/gradient/components/TiptapEditor/import/docxToHtml";

// Splits a Google Docs / Word .docx into one editable document per heading.
//
// Shared, because "one doc in, many ProseMirror documents out" is the same
// problem for a course's lessons and a project guide's steps. Only the noun
// and the S3 entity differ, and both are arguments. A blog import keeps the
// document whole and so uses `docxToHtml` directly instead.

export type SplitLevel = "h1" | "h2";

export interface DocxSection {
  title: string;
  /** ProseMirror JSON, ready for a `content` column. */
  content: Record<string, any>;
  /** Rendered as a preview line so the admin can sanity-check the split. */
  excerpt: string;
}

export interface DocxSectionResult {
  sections: DocxSection[];
  warnings: string[];
}

export interface DocxSectionOptions {
  splitLevel: SplitLevel;
  /** Where embedded images are uploaded — the S3 path and the row they belong to. */
  entityType: DocxEntityType;
  entityId: string;
  /** What one section is called, in warnings the admin reads. "lesson", "step". */
  noun: string;
  onProgress?: (message: string) => void;
}

/** Plain-text excerpt for the preview row. */
export const excerptFrom = (html: string): string => {
  const el = document.createElement("div");
  el.innerHTML = html;
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  return text.length > 140 ? `${text.slice(0, 140)}...` : text;
};

export interface HtmlSection {
  title: string;
  html: string;
}

export interface SplitResult {
  sections: HtmlSection[];
  /** Content that preceded the first heading of the chosen level, if any. */
  skippedHtml: string;
}

/**
 * Splits mammoth's HTML on headings of exactly `splitLevel`.
 *
 * Exported so the rule can be tested directly: only that level splits, every
 * other heading stays as content, and nothing before the first match becomes a
 * section.
 */
export function splitHtmlIntoSections(
  html: string,
  splitLevel: SplitLevel,
): SplitResult {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const splitTag = splitLevel.toUpperCase();

  // An image whose upload was skipped renders as an empty <img> — drop them
  // before splitting so no section carries a broken node.
  removeSkippedImages(doc.body);

  const sections: HtmlSection[] = [];
  let current: { title: string; parts: string[] } | null = null;
  const preamble: string[] = [];

  for (const node of Array.from(doc.body.children)) {
    if (node.tagName === splitTag) {
      if (current) {
        sections.push({ title: current.title, html: current.parts.join("") });
      }
      current = { title: node.textContent?.trim() || "Untitled", parts: [] };
      continue;
    }

    if (current) current.parts.push(node.outerHTML);
    else preamble.push(node.outerHTML);
  }

  if (current) {
    sections.push({ title: current.title, html: current.parts.join("") });
  }

  return { sections, skippedHtml: preamble.join("").trim() };
}

/**
 * Splits a .docx into one section per heading of the chosen level and converts
 * each to the ProseMirror JSON the editors store.
 *
 * The split level is honoured strictly: only a real heading of exactly that
 * level starts a section. Other heading levels stay as content inside the
 * section they fall in, and anything before the first matching heading is
 * reported as skipped rather than turned into a section of its own.
 */
export async function docxToSections(
  file: File,
  { splitLevel, entityType, entityId, noun, onProgress }: DocxSectionOptions,
): Promise<DocxSectionResult> {
  onProgress?.("Reading document...");

  const { html, warnings } = await docxToHtml(file, {
    entityType,
    entityId,
    onProgress,
  });

  // Before splitting, not after: an unclosed fence has to be able to see the
  // headings it would otherwise swallow.
  onProgress?.("Finding code blocks...");
  const code = extractCodeBlocks(html);
  warnings.push(...code.warnings);

  onProgress?.(`Splitting into ${noun}s...`);

  const { sections: groups, skippedHtml: preambleHtml } =
    splitHtmlIntoSections(code.html, splitLevel);

  const headingLabel = `Heading ${splitLevel === "h1" ? "1" : "2"}`;

  if (preambleHtml) {
    const skipped = excerptFrom(preambleHtml);
    warnings.push(
      `Content before the first ${headingLabel} was skipped${skipped ? `: "${skipped}"` : ""}. Put it under a ${headingLabel} if it should be its own ${noun}.`,
    );
  }

  if (groups.length === 0) {
    return {
      sections: [],
      warnings: [
        `No ${headingLabel} headings found. Every ${noun} must start with a ${headingLabel}, styled with Format > Paragraph styles > ${headingLabel} — text that merely looks like a heading will not split the document. Switch the split level if the document uses a different one.`,
      ],
    };
  }

  onProgress?.("Converting content...");

  const sections: DocxSection[] = groups.map((group) => ({
    title: group.title,
    // An empty section still needs a valid document, or the editor opens blank
    // and immediately marks the row dirty.
    content: group.html.trim()
      ? generateJSON(group.html, IMPORT_EXTENSIONS)
      : { type: "doc", content: [{ type: "paragraph" }] },
    excerpt: excerptFrom(group.html),
  }));

  return { sections, warnings };
}
