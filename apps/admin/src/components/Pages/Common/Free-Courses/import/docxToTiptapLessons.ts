import { generateJSON } from "@tiptap/core";

import { createEditorExtensions } from "@/components/TiptapEditor/TiptapEditor";
import { extractCodeBlocks } from "@/components/TiptapEditor/import/codeBlocks";
import {
  docxToHtml,
  removeSkippedImages,
} from "@/components/TiptapEditor/import/docxToHtml";

// Turns a Google Docs / Word .docx into v2 (Tiptap) lessons: the shared
// .docx-to-HTML step, which uploads the embedded images, then a split into one
// lesson per heading of the chosen level.
//
// The document is parsed against `createEditorExtensions()` — the very list the
// editor writes with. Parsing against a second, hand-kept list is how imported
// content ends up quietly missing nodes the editor could have shown.

export type SplitLevel = "h1" | "h2" | "none";

export interface DocxTiptapLesson {
  title: string;
  /** ProseMirror JSON, ready for the lesson's `content.doc`. */
  doc: Record<string, unknown>;
  /** Rendered as a preview line so the admin can sanity-check the split. */
  excerpt: string;
}

export interface DocxTiptapImportResult {
  lessons: DocxTiptapLesson[];
  warnings: string[];
}

export interface DocxTiptapImportOptions {
  splitOn?: SplitLevel;
  /** Used as the S3 entity id for any images pulled out of the document. */
  courseId: string;
  onProgress?: (uploaded: number) => void;
}

/** An empty document still has to be a valid one, or the editor opens broken. */
const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };

const titleFromFileName = (name: string) =>
  name.replace(/\.docx$/i, "").replace(/[_-]+/g, " ").trim() || "Untitled";

/** Plain-text excerpt for the preview row. */
const excerptFrom = (html: string): string => {
  const el = document.createElement("div");
  el.innerHTML = html;
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  return text.length > 140 ? `${text.slice(0, 140)}...` : text;
};

export interface HtmlSection {
  /** null for content that preceded the first heading of the split level. */
  title: string | null;
  html: string;
}

/**
 * Splits mammoth's HTML on headings of exactly `splitTag`.
 *
 * The level is honoured strictly: only a real heading of that exact level starts
 * a lesson. Other heading levels stay as content inside the lesson they fall in.
 * `splitTag` null means "do not split" — the whole document is one section.
 */
export function splitHtmlIntoSections(
  html: string,
  splitTag: "H1" | "H2" | null,
): HtmlSection[] {
  const doc = new DOMParser().parseFromString(html, "text/html");

  // An image whose upload was skipped renders as an empty <img> — drop them
  // before splitting so no lesson carries a broken node.
  removeSkippedImages(doc.body);

  if (!splitTag) {
    return [{ title: null, html: doc.body.innerHTML }];
  }

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

  const preambleHtml = preamble.join("").trim();
  if (preambleHtml) sections.unshift({ title: null, html: preambleHtml });

  return sections;
}

/**
 * Splits a .docx into one lesson per heading of the chosen level and converts
 * each to the ProseMirror JSON the lesson editor stores.
 */
export async function docxToTiptapLessons(
  file: File,
  { splitOn = "h1", courseId, onProgress }: DocxTiptapImportOptions,
): Promise<DocxTiptapImportResult> {
  const { html, warnings } = await docxToHtml(file, { courseId, onProgress });

  // Before splitting, not after: an unclosed fence has to be able to see the
  // headings it would otherwise swallow.
  const code = extractCodeBlocks(html);
  warnings.push(...code.warnings);

  const splitTag = splitOn === "h1" ? "H1" : splitOn === "h2" ? "H2" : null;
  const sections = splitHtmlIntoSections(code.html, splitTag);

  const extensions = createEditorExtensions();

  const lessons: DocxTiptapLesson[] = [];

  for (const section of sections) {
    const untitled = section.title === null;
    const body = section.html.trim();

    if (untitled && !body) continue;

    if (untitled && splitTag) {
      warnings.push(
        `Some content appeared before the first ${splitOn.toUpperCase()} and became a lesson named after the file — rename or remove it below.`,
      );
    }

    lessons.push({
      title: section.title ?? titleFromFileName(file.name),
      doc: body
        ? (generateJSON(body, extensions) as Record<string, unknown>)
        : EMPTY_DOC,
      excerpt: excerptFrom(section.html),
    });
  }

  if (lessons.length === 0) {
    warnings.push("That document appears to be empty.");
  } else if (splitTag && lessons.every((l) => l.title === titleFromFileName(file.name))) {
    warnings.push(
      `No ${splitOn.toUpperCase()} headings found, so the whole document became one lesson. Style your lesson titles as ${splitOn === "h1" ? "Heading 1" : "Heading 2"} in Google Docs to split it into several — text that merely looks like a heading will not split the document.`,
    );
  }

  return { lessons, warnings };
}
