import { normaliseLanguage } from "@/gradient/lib/code/languages";
import { FENCE_LINE } from "@/gradient/lib/code/fences";

// Turns fenced code in an imported .docx into real code blocks.
//
// Fences are the *only* thing that makes a code block. Named paragraph styles
// and monospace fonts were considered and deliberately left out: each works on
// some documents and silently fails on others, and a detector that is right
// most of the time is worse here than one that is right always. A missed block
// imports as ordinary paragraphs, which an admin can see and fix; a wrongly
// detected one quietly swallows prose into a code box.
//
// **This works on lines, not on elements.** An earlier version walked the
// document's top-level children and asked whether each one was a fence, which
// meant the answer depended on how Word or Google Docs happened to nest things
// — the same lesson imported or failed depending on whether the author used
// Enter or Shift+Enter, a bullet list, or the grey code box. Every fix for one
// shape leaked a new shape. So the document is flattened to a list of lines
// first, each remembering which element it came from; fences are matched in
// that stream and the elements they span are rebuilt afterwards. If an opening
// and a closing fence exist, whatever sits between them becomes code, however
// it was marked up.
//
// The output is `<pre><code class="language-python">`, which is exactly what
// `@tiptap/extension-code-block` parses (`preserveWhitespace: "full"`, language
// read off the class). So `generateJSON` and `IMPORT_EXTENSIONS` need no
// changes at all, and nothing here touches the schema.

export interface CodeBlockResult {
  html: string;
  /** How many blocks were found, for the dialog's summary line. */
  count: number;
  /** Of those, how many carry no language and need one picking in the editor. */
  noLanguageCount: number;
  warnings: string[];
}

const HEADINGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);

/** Spellings that mean "no highlighting", as opposed to a name we failed. */
const PLAINTEXT_SPELLINGS = new Set([
  "plaintext",
  "text",
  "txt",
  "plain",
  "none",
]);

const BLOCK_TAGS = new Set([
  "P", "DIV", "SECTION", "ARTICLE", "BLOCKQUOTE", "PRE",
  "UL", "OL", "LI",
  "TABLE", "THEAD", "TBODY", "TFOOT", "TR", "TD", "TH",
  "H1", "H2", "H3", "H4", "H5", "H6",
]);

/**
 * The lines of one top-level element.
 *
 * Line breaks reach us three ways and all three have to count: separate
 * paragraphs, `<br>` soft breaks (Shift+Enter, and how pasted code usually
 * lands), and the paragraphs inside a container — Google Docs' code box is a
 * one-cell table, and reading `textContent` off it would run a whole snippet
 * onto a single line.
 */
function linesOf(el: Element): string[] {
  const blocks = Array.from(el.children).filter((child) =>
    BLOCK_TAGS.has(child.tagName),
  );
  if (blocks.length) return blocks.flatMap((child) => linesOf(child));

  const clone = el.cloneNode(true) as Element;
  clone.querySelectorAll("br").forEach((br) => {
    br.replaceWith(clone.ownerDocument.createTextNode("\n"));
  });
  return (clone.textContent ?? "").split("\n");
}

/** The language on a fence line, or null when the line is not a fence. */
function fenceLanguage(line: string): string | null {
  const match = line.trim().match(FENCE_LINE);
  return match ? match[1] : null;
}

function resolve(raw: string) {
  const id = normaliseLanguage(raw);
  const recognised =
    !raw || id !== "plaintext" || PLAINTEXT_SPELLINGS.has(raw.toLowerCase());
  return { id, recognised };
}

/**
 * Builds `<pre><code class="language-…">`, joining lines with real newlines.
 *
 * Never `<br>`: TipTap's code-block parser keeps whitespace but has nothing to
 * do with a break element, so a block assembled that way imports as one
 * unbroken line.
 */
function makePre(doc: Document, code: string, languageId: string): HTMLElement {
  const pre = doc.createElement("pre");
  const codeEl = doc.createElement("code");
  codeEl.className = `language-${languageId}`;
  codeEl.textContent = code;
  pre.appendChild(codeEl);
  return pre;
}

const makeParagraph = (doc: Document, text: string): HTMLElement => {
  const p = doc.createElement("p");
  p.textContent = text;
  return p;
};

/** One top-level element, flattened to lines. */
interface Unit {
  el: Element;
  lines: string[];
  isHeading: boolean;
}

export function extractCodeBlocks(html: string): CodeBlockResult {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const warnings: string[] = [];
  const unknownLanguages = new Set<string>();
  let count = 0;
  let noLanguageCount = 0;

  const record = (raw: string) => {
    count += 1;
    const { id, recognised } = resolve(raw);
    if (!raw) noLanguageCount += 1;
    if (!recognised) unknownLanguages.add(raw);
    return id;
  };

  const units: Unit[] = Array.from(doc.body.children).map((el) => ({
    el,
    lines: linesOf(el),
    isHeading: HEADINGS.has(el.tagName),
  }));

  const fenceIn = (unit: Unit, from: number): number =>
    unit.lines.findIndex((line, idx) => idx >= from && fenceLanguage(line) !== null);

  let u = 0;

  while (u < units.length) {
    const start = units[u];

    // A fence inside a heading is not a fence — headings split the lessons and
    // are never touched.
    if (start.isHeading) {
      u += 1;
      continue;
    }

    const openLine = fenceIn(start, 0);
    if (openLine === -1) {
      u += 1;
      continue;
    }

    // Find the closing fence: later in the same element first, then onward
    // through following elements. The search stops dead at a heading — taking a
    // closing fence from beyond one would turn that heading into code text and
    // merge every lesson after it into this block. That is the one structural
    // rule this function will not trade away.
    let endU = -1;
    let endLine = -1;

    const sameElement = fenceIn(start, openLine + 1);
    if (sameElement !== -1) {
      endU = u;
      endLine = sameElement;
    } else {
      for (let k = u + 1; k < units.length; k++) {
        if (units[k].isHeading) break;
        const found = fenceIn(units[k], 0);
        if (found !== -1) {
          endU = k;
          endLine = found;
          break;
        }
      }
    }

    // A block needs both fences. An opener on its own is a mistake in the
    // document, and the importer does not guess where the author meant it to
    // end — it invents no closing fence, changes nothing, and says so. An
    // earlier version ran the block to the next heading instead, which turned
    // one missing ``` into a lesson full of code that was never code.
    if (endU === -1) {
      const opened = fenceLanguage(start.lines[openLine]) ?? "";
      warnings.push(
        `An opening \`\`\`${opened} has no closing \`\`\` before the next ` +
          "heading, so nothing there became a code block. Add the closing " +
          "``` line and import again.",
      );
      u += 1;
      continue;
    }

    const lastU = endU;

    // Collect the code, and whatever shared an element with a fence.
    const leading = start.lines.slice(0, openLine);
    const code: string[] = [];
    let trailing: string[] = [];

    if (endU === u) {
      // Both fences inside the same element.
      code.push(...start.lines.slice(openLine + 1, endLine));
      trailing = start.lines.slice(endLine + 1);
    } else {
      code.push(...start.lines.slice(openLine + 1));
      for (let k = u + 1; k < lastU; k++) code.push(...units[k].lines);
      const last = units[lastU];
      code.push(...last.lines.slice(0, endLine));
      trailing = last.lines.slice(endLine + 1);
    }

    const codeText = code.join("\n").replace(/^\n+|\n+$/g, "");

    const languageId = record(fenceLanguage(start.lines[openLine]) ?? "");

    // Rebuild: anything that shared an element with a fence comes back as
    // plain paragraphs. It loses bold and links, which only happens when an
    // author put prose on the same line as a fence or inside a code box —
    // far better than leaving it buried in the code block.
    const leadingParas = leading
      .filter((l) => l.trim())
      .map((l) => makeParagraph(doc, l));
    const trailingParas = trailing
      .filter((l) => l.trim())
      .map((l) => makeParagraph(doc, l));
    const pre = makePre(doc, codeText, languageId);

    for (const node of [...leadingParas, pre, ...trailingParas]) {
      start.el.before(node);
    }
    for (let k = u; k <= lastU; k++) units[k].el.remove();

    // The lines that followed a closing fence go back into the scan, they are
    // not finished with. A document with several blocks in one code box puts
    // the *next* block's opening fence in exactly this leftover; skipping it
    // orphaned that block and left every later fence paired one step out —
    // stray ``` as text, code stranded outside a block, an empty block where
    // two fences met, and the prose at the end swallowed by the last one.
    // `leading` needs no such treatment: it sits before the first fence in the
    // element, so by definition it contains none.
    units.splice(
      lastU + 1,
      0,
      ...trailingParas.map((el) => ({
        el,
        lines: [el.textContent ?? ""],
        isHeading: false,
      })),
    );

    u = lastU + 1;
  }

  for (const name of unknownLanguages) {
    warnings.push(
      `"${name}" is not a language we highlight, so that block was imported as ` +
        "plain text. Pick a language in the editor if it needs colour.",
    );
  }

  if (count > 0) {
    warnings.push(
      noLanguageCount > 0
        ? `${count} code block${count === 1 ? "" : "s"} imported. ` +
            `${noLanguageCount} ${noLanguageCount === 1 ? "has" : "have"} no ` +
            `language set — open ${noLanguageCount === 1 ? "it" : "them"} in ` +
            "the editor to pick one."
        : `${count} code block${count === 1 ? "" : "s"} imported.`,
    );
  }

  return { html: doc.body.innerHTML, count, noLanguageCount, warnings };
}
