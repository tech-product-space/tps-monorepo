import { nanoid } from "nanoid";
import type { IBlockBase } from "@/components/block-editor/types/block.types";
import {
  createHeader,
  createParagraph,
  createTable,
  createCard,
  createVideo,
  createYoutube,
  createLayout,
} from "@/components/block-editor/utils/blockFactory";
import { extractYoutubeId } from "@/components/block-editor/utils/youtube";

// Converts the markdown an AI returns for a lesson body into BlockEditor blocks,
// stored as `course_module_lessons.content = { blocks }`.
//
// Nothing validates block data at rest: `IBlockBase.data` is Record<string, any>,
// the previews use dangerouslySetInnerHTML, and the editor's normalisers only run
// inside Quill's onChange. So every shape below has to be right on the way in.
//
//   #, ##        -> header  { html: "<h2>..</h2>" }   (Quill offers h2/h3 only)
//   ###+         -> header  { html: "<h3>..</h3>" }
//   paragraph    -> paragraph { html: "<p>..</p>" }
//   - / 1. list  -> paragraph { html: "<ul>|<ol>..</ul>" }  (no list block exists)
//   | table |    -> table   { html: "<table><tbody>.." }    (no <thead>)
//   > quote      -> card    { variant: "info", html }       (h3/h4 only inside)
//   youtube url  -> youtube { src }                         (must be a full URL)
//   .mp4 url     -> video   { sourceMode: "url", src }
//   ![alt](url)  -> dropped; images need an S3 key, not a URL
//
// Everything is wrapped in one root layout("column") because that is the only
// thing BlockEditor can add at root — flat root blocks can't get siblings.

export interface BlockConversion {
  blocks: IBlockBase[];
  // Things the markdown asked for that the block model can't represent.
  // Surfaced in the import preview rather than dropped silently.
  warnings: string[];
}

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const FENCE = /^\s*```/;
const HR = /^\s*(?:---+|\*\*\*+|___+)\s*$/;
const TABLE_ROW = /^\s*\|(.+)\|\s*$/;
const TABLE_DIVIDER = /^\s*\|?[\s:|-]+\|[\s:|-]*$/;
const IMAGE_ONLY = /^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/;
const URL_ONLY = /^\s*<?(https?:\/\/[^\s>]+)>?\s*$/;
const VIDEO_FILE = /\.(mp4|webm|ogg|mov|m4v)(\?|#|$)/i;

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Inline markdown -> the tags Quill round-trips. useQuillPasteSanitizer's
// allowlist maps strong->b and em->i, so emit b/i directly.
const inline = (s: string): string => {
  let out = escapeHtml(s);
  out = out.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_m, alt) => escapeHtml(String(alt)),
  );
  out = out.replace(
    /\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g,
    (_m, text, href) => `<a href="${href}">${text}</a>`,
  );
  out = out.replace(/(\*\*|__)(.+?)\1/g, "<b>$2</b>");
  out = out.replace(/(?<![*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, "<i>$1</i>");
  out = out.replace(/(?<![_\w])_(?!\s)(.+?)(?<!\s)_(?!\w)/g, "<i>$1</i>");
  out = out.replace(/~~(.+?)~~/g, "<s>$1</s>");
  out = out.replace(/`([^`]+)`/g, "$1");
  return out.trim();
};

const isBlank = (l: string) => !l.trim();

const splitRow = (line: string): string[] => {
  const m = line.match(TABLE_ROW);
  if (!m) return [];
  return m[1].split("|").map((c) => c.trim());
};

export function markdownToBlocks(markdown: string): BlockConversion {
  const warnings: string[] = [];
  if (!markdown || !markdown.trim()) return { blocks: [], warnings };

  const lines = markdown
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "  ")
    .split("\n");

  const blocks: IBlockBase[] = [];
  let paragraph: string[] = [];
  let images = 0;

  const pushHeader = (level: 2 | 3, text: string) => {
    const b = createHeader();
    // Single line: HeaderBlock's normaliser matches with a non-dotall regex.
    b.data.html = `<h${level}>${inline(text)}</h${level}>`;
    blocks.push(b);
  };

  const pushParagraphHtml = (html: string) => {
    const b = createParagraph();
    b.data.html = html;
    blocks.push(b);
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;
    // Soft-wrapped lines are one paragraph.
    const text = paragraph.join(" ").trim();
    paragraph = [];
    const html = inline(text);
    if (html) pushParagraphHtml(`<p>${html}</p>`);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code: no code block type exists, so keep the text as a paragraph.
    if (FENCE.test(line)) {
      flushParagraph();
      const body: string[] = [];
      let j = i + 1;
      while (j < lines.length && !FENCE.test(lines[j])) {
        body.push(lines[j]);
        j++;
      }
      i = j;
      const text = body.join("\n").trim();
      if (text) {
        pushParagraphHtml(
          `<p>${escapeHtml(text).replace(/\n/g, "<br>")}</p>`,
        );
      }
      continue;
    }

    if (isBlank(line) || HR.test(line)) {
      flushParagraph();
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      flushParagraph();
      // Quill's toolbar is [{ header: [2, 3] }] — anything else is normalised
      // away the next time a human opens the block.
      pushHeader(heading[1].length <= 2 ? 2 : 3, heading[2]);
      continue;
    }

    // An image on its own line: the image block resolves an S3 key against the
    // CDN base, so a URL here would render as cdn.../https://... — drop it.
    const imageOnly = line.match(IMAGE_ONLY);
    if (imageOnly) {
      flushParagraph();
      images++;
      continue;
    }

    // A bare URL on its own line becomes an embed.
    const urlOnly = line.match(URL_ONLY);
    if (urlOnly) {
      const url = urlOnly[1];
      if (extractYoutubeId(url)) {
        flushParagraph();
        const b = createYoutube();
        b.data.src = url;
        blocks.push(b);
        continue;
      }
      if (VIDEO_FILE.test(url)) {
        flushParagraph();
        const b = createVideo();
        b.data.sourceMode = "url";
        b.data.src = url;
        blocks.push(b);
        continue;
      }
      if (/youtube\.com|youtu\.be/i.test(url)) {
        // Looks like YouTube but the id isn't extractable — the block would
        // render as nothing, so keep it as a link and say so.
        flushParagraph();
        warnings.push(
          `Couldn't read a video id from ${url} — kept it as a link.`,
        );
        pushParagraphHtml(`<p><a href="${url}">${escapeHtml(url)}</a></p>`);
        continue;
      }
      // Any other bare URL falls through to normal paragraph handling.
    }

    if (TABLE_ROW.test(line) && TABLE_DIVIDER.test(lines[i + 1] ?? "")) {
      flushParagraph();
      const header = splitRow(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && TABLE_ROW.test(lines[j])) {
        rows.push(splitRow(lines[j]));
        j++;
      }
      i = j - 1;

      // Matches buildTableHtml: header cells are <th> inside <tbody>, no <thead>.
      const headHtml = header.map((c) => `<th>${inline(c)}</th>`).join("");
      const bodyHtml = rows
        .map(
          (r) =>
            `<tr>${header
              .map((_, c) => `<td>${inline(r[c] ?? "")}</td>`)
              .join("")}</tr>`,
        )
        .join("");
      const b = createTable();
      b.data.html = `<table><tbody><tr>${headHtml}</tr>${bodyHtml}</tbody></table>`;
      blocks.push(b);

      if (header.length > 5) {
        warnings.push(
          `A table has ${header.length} columns; the public page only sizes the first 5.`,
        );
      }
      continue;
    }

    if (QUOTE.test(line)) {
      flushParagraph();
      const body: string[] = [];
      let j = i;
      while (j < lines.length && QUOTE.test(lines[j])) {
        body.push(lines[j].match(QUOTE)![1]);
        j++;
      }
      i = j - 1;
      const text = body.join(" ").trim();
      if (text) {
        const b = createCard();
        b.data.variant = "info";
        b.data.html = `<p>${inline(text)}</p>`;
        blocks.push(b);
      }
      continue;
    }

    if (BULLET.test(line)) {
      flushParagraph();
      const first = line.match(BULLET)!;
      const runBase = first[1].length;
      const runOrdered = /\d/.test(first[2]);

      // A marker change at the top level ends the list — otherwise a numbered
      // list following a bulleted one gets absorbed and rendered as bullets.
      const continuesRun = (m: RegExpMatchArray) =>
        m[1].length > runBase || /\d/.test(m[2]) === runOrdered;

      const run: { indent: number; text: string; ordered: boolean }[] = [];
      let j = i;
      while (j < lines.length) {
        const m = lines[j].match(BULLET);
        if (m) {
          if (!continuesRun(m)) break;
          run.push({
            indent: m[1].length,
            text: m[3],
            ordered: /\d/.test(m[2]),
          });
          j++;
          continue;
        }
        // A blank line continues the list only if the next bullet belongs to it.
        const next = isBlank(lines[j]) ? lines[j + 1]?.match(BULLET) : null;
        if (next && continuesRun(next)) {
          j++;
          continue;
        }
        break;
      }
      i = j - 1;
      pushParagraphHtml(listToHtml(run));
      continue;
    }

    paragraph.push(line.trim());
  }

  flushParagraph();

  if (images > 0) {
    warnings.push(
      `${images} image${images > 1 ? "s were" : " was"} skipped — images must be uploaded in the lesson editor.`,
    );
  }

  if (blocks.length === 0) return { blocks: [], warnings };

  // BlockEditor's only root action is "Add Layout", and it refuses to reorder a
  // layout against a non-layout sibling — so root has to be a single layout.
  const root = createLayout("column");
  root.children = blocks;

  return { blocks: [root], warnings };
}

// A sub-list lives inside its parent <li>. Only two levels are modelled;
// anything deeper folds into the second.
function listToHtml(
  run: { indent: number; text: string; ordered: boolean }[],
): string {
  const items = run.filter((r) => r.text.trim());
  if (!items.length) return "";

  const base = Math.min(...items.map((r) => r.indent));

  const groups: {
    text: string;
    subs: { text: string; ordered: boolean }[];
  }[] = [];

  for (const item of items) {
    if (item.indent === base || groups.length === 0) {
      groups.push({ text: item.text, subs: [] });
    } else {
      groups[groups.length - 1].subs.push(item);
    }
  }

  const body = groups
    .map((g) => {
      const sub = g.subs.length
        ? `<${g.subs[0].ordered ? "ol" : "ul"}>` +
          g.subs.map((s) => `<li>${inline(s.text)}</li>`).join("") +
          `</${g.subs[0].ordered ? "ol" : "ul"}>`
        : "";
      return `<li>${inline(g.text)}${sub}</li>`;
    })
    .join("");

  const tag = items[0].ordered ? "ol" : "ul";
  return `<${tag}>${body}</${tag}>`;
}

// Counts blocks including layout children, for the import preview.
export function countBlocks(blocks: IBlockBase[]): number {
  return blocks.reduce(
    (n, b) => n + 1 + (b.children ? countBlocks(b.children) : 0),
    0,
  );
}

// Fresh ids for every block in a tree. Ids are React keys and dnd-kit sortable
// ids, so duplicates across lessons would collide in the editor.
export function reidBlocks(blocks: IBlockBase[]): IBlockBase[] {
  return blocks.map((b) => ({
    ...b,
    id: nanoid(),
    children: b.children ? reidBlocks(b.children) : undefined,
  }));
}
