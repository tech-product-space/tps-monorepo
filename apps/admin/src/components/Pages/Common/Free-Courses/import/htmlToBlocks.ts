import type { IBlockBase } from "@/components/block-editor/types/block.types";
import {
  createHeader,
  createParagraph,
  createTable,
  createCard,
  createImage,
  createYoutube,
  createLayout,
  createCode,
} from "@/components/block-editor/utils/blockFactory";
import { extractYoutubeId } from "@/components/block-editor/utils/youtube";
import {
  isOpenFence,
  isCloseFence,
  fenceLanguage,
  cleanCodeText,
} from "./parseFencedCode";

// Converts the semantic HTML mammoth produces from a .docx into BlockEditor
// blocks. Same target shapes as markdownToBlocks — see the notes there; nothing
// validates block data at rest, so the HTML has to be right on the way in.
//
//   h1/h2      -> header { html: "<h2>..</h2>" }   (Quill offers h2/h3 only)
//   h3..h6     -> header { html: "<h3>..</h3>" }
//   p          -> paragraph { html: "<p>..</p>" }
//   ul/ol      -> paragraph { html: "<ul>|<ol>.." }  (no list block exists)
//   table      -> table { html: "<table><tbody>.." } (first row becomes <th>)
//   blockquote -> card { variant: "info", html }
//   img        -> image { key }   (key set by the caller's uploader)
//
// Inline tags are narrowed to what the paragraph Quill config allows:
// bold/italic/underline/strike/link. Everything else (spans, styles, classes —
// which Word/Docs HTML is full of) is unwrapped to its text.

export interface HtmlConversion {
  blocks: IBlockBase[];
  warnings: string[];
}

// Word/Docs emphasis tags -> the tags Quill round-trips.
const INLINE_TAGS: Record<string, string> = {
  B: "b",
  STRONG: "b",
  I: "i",
  EM: "i",
  U: "u",
  INS: "u",
  S: "s",
  STRIKE: "s",
  DEL: "s",
  A: "a",
  BR: "br",
};

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const isElement = (n: Node): n is Element => n.nodeType === 1;
const isText = (n: Node): n is Text => n.nodeType === 3;

// Collapses runs of whitespace in the text between tags, leaving tags (and their
// attributes) untouched. Text nodes are escaped before this runs, so any literal
// "<" left in the string is genuinely the start of a tag.
//
// Needed because unwrapping an element — Word's endless empty <strong>s, or an
// <img> lifted out into its own block — leaves the spaces that surrounded it
// stranded side by side.
const collapseOutsideTags = (html: string): string =>
  html
    .split(/(<[^>]*>)/)
    .map((part, i) => (i % 2 === 1 ? part : part.replace(/\s{2,}/g, " ")))
    .join("");

function inlineHtml(node: Node): string {
  // Whitespace is collapsed the way HTML itself would render it. This also keeps
  // newlines out of the result, which matters for headers: the editor's
  // normalizeHeadingHTML matches with a non-dotall regex, so a newline inside
  // <h2>…</h2> would make it return "" and silently wipe the heading.
  if (isText(node))
    return escapeHtml((node.textContent ?? "").replace(/\s+/g, " "));
  if (!isElement(node)) return "";

  const inner = Array.from(node.childNodes).map(inlineHtml).join("");
  const tag = INLINE_TAGS[node.tagName];

  // Unknown element (span, font, div…) — keep the text, drop the wrapper.
  if (!tag) return inner;
  if (tag === "br") return "<br>";

  if (tag === "a") {
    const href = node.getAttribute("href") ?? "";
    if (!href || !inner.trim()) return inner;
    return `<a href="${escapeHtml(href)}">${inner}</a>`;
  }

  // Word emits empty <strong> wrappers constantly; don't keep them.
  if (!inner.trim()) return inner;
  return `<${tag}>${inner}</${tag}>`;
}

const childrenInline = (el: Element): string =>
  collapseOutsideTags(Array.from(el.childNodes).map(inlineHtml).join("")).trim();

// Cell content may be wrapped in <p>; unwrap so cells stay single-line.
function cellHtml(cell: Element): string {
  const paras = Array.from(cell.children).filter((c) => c.tagName === "P");
  if (paras.length) {
    return paras
      .map((p) => childrenInline(p))
      .filter(Boolean)
      .join(" ");
  }
  return childrenInline(cell);
}

function listHtml(el: Element): string {
  const tag = el.tagName.toLowerCase(); // ul | ol
  const items = Array.from(el.children)
    .filter((c) => c.tagName === "LI")
    .map((li) => {
      let text = "";
      let sub = "";
      for (const child of Array.from(li.childNodes)) {
        if (isElement(child) && (child.tagName === "UL" || child.tagName === "OL")) {
          sub += listHtml(child);
        } else {
          text += inlineHtml(child);
        }
      }
      return `<li>${text.trim()}${sub}</li>`;
    })
    .join("");
  return items ? `<${tag}>${items}</${tag}>` : "";
}

function tableHtml(el: Element): { html: string; columns: number } {
  const rows = Array.from(el.querySelectorAll("tr"));
  if (!rows.length) return { html: "", columns: 0 };

  const cellsOf = (tr: Element) =>
    Array.from(tr.children).filter(
      (c) => c.tagName === "TD" || c.tagName === "TH",
    );

  // A single-row table has no header — in Google Docs that shape is a callout or
  // layout device, not data. Promoting its cells to <th> makes them unwrappable:
  // both the preview and the public page set `white-space: nowrap` on <th>, so a
  // sentence-length cell would run off the page instead of wrapping.
  const hasHeaderRow = rows.length > 1;

  const rowHtml = (tr: Element, tag: "th" | "td") =>
    `<tr>${cellsOf(tr)
      .map((c) => `<${tag}>${cellHtml(c)}</${tag}>`)
      .join("")}</tr>`;

  // Matches buildTableHtml: header cells are <th> inside <tbody>, no <thead>.
  const body = rows
    .map((tr, i) => rowHtml(tr, hasHeaderRow && i === 0 ? "th" : "td"))
    .join("");

  return {
    html: `<table><tbody>${body}</tbody></table>`,
    columns: cellsOf(rows[0]).length,
  };
}

/**
 * Converts a list of sibling element nodes into blocks.
 *
 * `imageKeyFor` maps an <img> element to the S3 key already uploaded for it;
 * returning null drops the image (the image block can only render an S3 key).
 */
export function htmlNodesToBlocks(
  nodes: Node[],
  imageKeyFor: (img: Element) => string | null,
): HtmlConversion {
  const warnings: string[] = [];
  const blocks: IBlockBase[] = [];

  const pushHeader = (level: 2 | 3, html: string) => {
    if (!html) return;
    const b = createHeader();
    b.data.html = `<h${level}>${html}</h${level}>`;
    blocks.push(b);
  };

  const pushParagraph = (html: string) => {
    if (!html) return;
    const b = createParagraph();
    b.data.html = html;
    blocks.push(b);
  };

  const pushImage = (img: Element) => {
    const key = imageKeyFor(img);
    if (!key) return;
    const b = createImage();
    b.data.key = key;
    b.data.alt = img.getAttribute("alt") ?? "";
    blocks.push(b);
  };

  const handleParagraph = (el: Element) => {
    const imgs = Array.from(el.querySelectorAll("img"));

    // A bare link to a video on its own line becomes an embed, matching the
    // markdown importer's behaviour.
    const text = (el.textContent ?? "").trim();
    const onlyLink = el.querySelectorAll("a").length === 1 && !imgs.length;
    if (onlyLink) {
      const href = el.querySelector("a")?.getAttribute("href") ?? "";
      const sameAsText = text === href || !text;
      if (sameAsText && extractYoutubeId(href)) {
        const b = createYoutube();
        b.data.src = href;
        blocks.push(b);
        return;
      }
    }

    if (imgs.length) {
      // Word wraps images in a <p>; emit the images, plus any real text with them.
      imgs.forEach(pushImage);
      const clone = el.cloneNode(true) as Element;
      clone.querySelectorAll("img").forEach((n) => n.remove());
      const rest = childrenInline(clone);
      if (rest) pushParagraph(`<p>${rest}</p>`);
      return;
    }

    const html = childrenInline(el);
    if (html) pushParagraph(`<p>${html}</p>`);
  };

  // ---- fenced code (``` … ```) ----
  // A triple-backtick fence is the single, explicit "this is code" signal — no
  // fuzzy font/style guessing. A fence can span many paragraphs (one <p> per
  // line, the usual Docs shape) or live inside one <p> split by <br>, so we work
  // at the level of text *lines* rather than whole paragraphs.
  let codeBuf: string[] | null = null;
  let codeLang = "plaintext";

  const flushCode = () => {
    if (codeBuf === null) return;
    const b = createCode();
    b.data.code = cleanCodeText(codeBuf.join("\n"));
    b.data.language = codeLang;
    blocks.push(b);
    codeBuf = null;
    codeLang = "plaintext";
  };

  // Raw text lines of a paragraph: split on <br>, indentation kept, inline
  // formatting (<b>, <a>, coloured <span>…) flattened to its text.
  const paragraphLines = (el: Element): string[] => {
    const lines: string[] = [];
    let cur = "";
    const walk = (n: Node) => {
      if (isText(n)) {
        cur += n.textContent ?? "";
        return;
      }
      if (!isElement(n)) return;
      if (n.tagName === "BR") {
        lines.push(cur);
        cur = "";
        return;
      }
      Array.from(n.childNodes).forEach(walk);
    };
    Array.from(el.childNodes).forEach(walk);
    lines.push(cur);
    return lines;
  };

  // Runs one line through the fence state machine. Returns true when the line
  // was consumed as code handling (opened a fence, closed one, or was buffered).
  const consumeLine = (line: string): boolean => {
    if (codeBuf !== null) {
      if (isCloseFence(line)) flushCode();
      else codeBuf.push(line);
      return true;
    }
    if (isOpenFence(line)) {
      codeBuf = [];
      codeLang = fenceLanguage(line);
      return true;
    }
    return false;
  };

  const emitElement = (node: Element) => {
    switch (node.tagName) {
      case "H1":
      case "H2":
        pushHeader(2, childrenInline(node));
        break;
      case "H3":
      case "H4":
      case "H5":
      case "H6":
        pushHeader(3, childrenInline(node));
        break;
      case "P":
        handleParagraph(node);
        break;
      case "UL":
      case "OL":
        pushParagraph(listHtml(node));
        break;
      case "TABLE": {
        const { html, columns } = tableHtml(node);
        if (html) {
          const b = createTable();
          b.data.html = html;
          blocks.push(b);
          if (columns > 5) {
            warnings.push(
              `A table has ${columns} columns; the public page only sizes the first 5.`,
            );
          }
        }
        break;
      }
      case "BLOCKQUOTE": {
        const html = childrenInline(node);
        if (html) {
          const b = createCard();
          b.data.variant = "info";
          b.data.html = `<p>${html}</p>`;
          blocks.push(b);
        }
        break;
      }
      case "IMG":
        pushImage(node);
        break;
      case "BR":
      case "HR":
        break;
      default: {
        // Unknown wrapper (div, section…) — recurse so its content isn't lost.
        const inner = htmlNodesToBlocks(
          Array.from(node.childNodes),
          imageKeyFor,
        );
        blocks.push(...inner.blocks);
        warnings.push(...inner.warnings);
      }
    }
  };

  for (const node of nodes) {
    if (isText(node)) {
      const raw = node.textContent ?? "";
      if (codeBuf !== null) {
        // Bare text between blocks while a fence is open — keep it verbatim.
        if (raw.trim()) consumeLine(raw);
        continue;
      }
      const t = raw.trim();
      if (t && !consumeLine(t)) pushParagraph(`<p>${escapeHtml(t)}</p>`);
      continue;
    }
    if (!isElement(node)) continue;

    if (node.tagName === "P") {
      const lines = paragraphLines(node);
      const hasFence = lines.some((l) => isOpenFence(l) || isCloseFence(l));
      // Fast path: an ordinary paragraph, no fence in play — keep its full
      // existing handling (images, YouTube embeds, inline formatting).
      if (codeBuf === null && !hasFence) {
        handleParagraph(node);
        continue;
      }
      // Fence in play: route line by line; any stray prose becomes a paragraph.
      for (const line of lines) {
        if (consumeLine(line)) continue;
        const t = line.trim();
        if (t) pushParagraph(`<p>${escapeHtml(t)}</p>`);
      }
      continue;
    }

    // Any structured block (heading, table, image, list, blockquote…).
    if (codeBuf !== null) {
      // A fence was left open when real content arrived — close it rather than
      // swallow the rest of the lesson, and flag it for the admin.
      flushCode();
      warnings.push(
        "A code block (```) was not closed before other content — imported what came before it as code; please check it.",
      );
    }
    emitElement(node);
  }

  if (codeBuf !== null) {
    flushCode();
    warnings.push(
      "A code block (```) was opened but never closed — imported the rest as code; please check it.",
    );
  }

  return { blocks, warnings };
}

/**
 * Wraps blocks in the single root layout the editor requires — its only
 * root-level action is "Add Layout", and it refuses to reorder a layout against
 * a non-layout sibling, so flat root blocks can't get siblings.
 */
export function wrapInRootLayout(blocks: IBlockBase[]): IBlockBase[] {
  if (blocks.length === 0) return [];
  const root = createLayout("column");
  root.children = blocks;
  return [root];
}

export interface NodeGroup {
  // null for content sitting above the first split heading — it has no heading
  // of its own, so the caller supplies a fallback title.
  title: string | null;
  nodes: Node[];
}

/**
 * Splits a document's top-level nodes into one group per split heading, each
 * heading becoming a lesson title. `splitTag` of null means "don't split".
 */
export function groupNodesByHeading(
  nodes: Node[],
  splitTag: "H1" | "H2" | null,
): NodeGroup[] {
  const groups: NodeGroup[] = [];
  let current: NodeGroup = { title: null, nodes: [] };

  for (const node of nodes) {
    const isSplit =
      splitTag !== null &&
      node.nodeType === 1 &&
      (node as Element).tagName === splitTag;

    if (isSplit) {
      if (current.title !== null || current.nodes.length) groups.push(current);
      current = {
        title: ((node as Element).textContent ?? "").trim() || "Untitled",
        nodes: [],
      };
      continue;
    }
    current.nodes.push(node);
  }

  if (current.title !== null || current.nodes.length) groups.push(current);
  return groups;
}
