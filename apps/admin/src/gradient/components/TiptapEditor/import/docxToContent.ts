import { generateJSON } from "@tiptap/html";

import { IMPORT_EXTENSIONS } from "@/gradient/components/TiptapEditor/importExtensions";
import { extractCodeBlocks } from "./codeBlocks";
import {
  docxToHtml,
  removeSkippedImages,
  type DocxEntityType,
} from "./docxToHtml";

// Imports a .docx as ONE document, for editors that hold a single body of
// content — a blog post, a resource, a recording write-up. The lesson importer
// is the other shape: same conversion, then split into many documents.
//
// Parsing is split in two on purpose. `docxToDocument` does the expensive,
// one-way half — reading the file and uploading its images — and hands back
// HTML. `documentToJSON` is pure, so the dialog can re-run it every time the
// admin flips a checkbox without re-uploading a single image.

export interface DocxStats {
  headings: number;
  images: number;
  codeBlocks: number;
  tables: number;
  words: number;
}

export interface DocxDocument {
  /** Images uploaded, fenced code turned into `<pre><code>`, ready to preview. */
  html: string;
  warnings: string[];
  /**
   * Text of the leading Heading 1, when the document opens with one. A doc
   * usually starts with the article's own title, which the blog stores as a
   * separate field — so the caller offers to drop it rather than publishing it
   * twice.
   */
  leadingHeading: string | null;
  stats: DocxStats;
}

export interface DocxContentOptions {
  entityType: DocxEntityType;
  entityId: string;
  onProgress?: (message: string) => void;
}

const parse = (html: string): Document =>
  new DOMParser().parseFromString(html, "text/html");

/** The document's first element, ignoring whitespace-only paragraphs. */
function firstBlock(body: HTMLElement): Element | null {
  for (const node of Array.from(body.children)) {
    if ((node.textContent || "").trim() || node.querySelector("img")) {
      return node;
    }
  }
  return null;
}

function statsFor(body: HTMLElement): DocxStats {
  const text = (body.textContent || "").trim();
  return {
    headings: body.querySelectorAll("h1, h2, h3, h4, h5, h6").length,
    images: body.querySelectorAll("img").length,
    codeBlocks: body.querySelectorAll("pre").length,
    tables: body.querySelectorAll("table").length,
    words: text ? text.split(/\s+/).length : 0,
  };
}

/**
 * Reads a .docx into preview-ready HTML: images uploaded to S3, fenced code
 * turned into real code blocks, skipped images dropped.
 */
export async function docxToDocument(
  file: File,
  { entityType, entityId, onProgress }: DocxContentOptions,
): Promise<DocxDocument> {
  onProgress?.("Reading document...");

  const { html, warnings } = await docxToHtml(file, {
    entityType,
    entityId,
    onProgress,
  });

  onProgress?.("Finding code blocks...");
  const code = extractCodeBlocks(html);
  warnings.push(...code.warnings);

  const doc = parse(code.html);
  removeSkippedImages(doc.body);

  const lead = firstBlock(doc.body);
  const leadingHeading =
    lead?.tagName === "H1" ? lead.textContent?.trim() || null : null;

  return {
    html: doc.body.innerHTML,
    warnings,
    leadingHeading,
    stats: statsFor(doc.body),
  };
}

/** Drops the leading Heading 1, when there is one. Pure; safe to call twice. */
export function stripLeadingHeading(html: string): string {
  const doc = parse(html);
  const lead = firstBlock(doc.body);
  if (lead?.tagName !== "H1") return html;
  lead.remove();
  return doc.body.innerHTML;
}

/**
 * Converts the HTML to the ProseMirror JSON the editor stores.
 *
 * Parsed against `IMPORT_EXTENSIONS` — the editor's own schema — so nothing
 * produced here is silently dropped the moment the document is opened.
 */
export function documentToJSON(
  html: string,
  { dropLeadingHeading = false }: { dropLeadingHeading?: boolean } = {},
): Record<string, unknown> {
  const source = dropLeadingHeading ? stripLeadingHeading(html) : html;

  // An empty document still has to be a valid one, or the editor opens blank
  // and immediately marks itself dirty.
  return source.trim()
    ? generateJSON(source, IMPORT_EXTENSIONS)
    : { type: "doc", content: [{ type: "paragraph" }] };
}
