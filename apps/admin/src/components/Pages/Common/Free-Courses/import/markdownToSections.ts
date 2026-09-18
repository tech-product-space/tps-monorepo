import type {
  ContentElement,
  ContentSectionData,
} from "../common/ContentSection";

// Converts the markdown an AI returns for a module overview into the section /
// element shape that ContentSection renders and `course_modules.overview` stores.
//
// Mapping:
//   #, ## Heading      -> new section (heading)
//   ###+ Subheading    -> subheading on the current section
//   paragraph text     -> { type: "paragraph", content }
//   flat - list        -> { type: "bullets", listItems }
//   indented - list    -> { type: "nested-bullets", nestedItems }
//
// Element `content` is plain text: ContentSection edits it in a Textarea and the
// public site renders it as-is, so inline markdown is stripped rather than kept.

// Matches the id style already used by ContentSection.addElement.
const newId = () => Math.random().toString(36).substr(2, 9);

const BULLET = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const FENCE = /^\s*```/;
const HR = /^\s*(?:---+|\*\*\*+|___+)\s*$/;

// Turns inline markdown into the plain text the Textarea/public page expect.
// Links keep their target — "docs (https://…)" — since dropping it loses info.
const stripInline = (s: string): string =>
  s
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*>\s?/, "")
    .trim();

const emptySection = (heading = ""): ContentSectionData => ({
  id: newId(),
  heading,
  subheading: "",
  elements: [],
});

const isBlank = (line: string) => !line.trim();

export function markdownToSections(markdown: string): ContentSectionData[] {
  if (!markdown || !markdown.trim()) return [];

  const lines = markdown
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "  ")
    .split("\n");

  const sections: ContentSectionData[] = [];
  let current: ContentSectionData | null = null;
  let paragraph: string[] = [];
  let inFence = false;

  // Content can appear before the first heading; give it a home.
  const section = (): ContentSectionData => {
    if (!current) {
      current = emptySection();
      sections.push(current);
    }
    return current;
  };

  const flushParagraph = () => {
    if (!paragraph.length) return;
    // Soft-wrapped lines are one paragraph, so join with a space.
    const content = paragraph.map(stripInline).filter(Boolean).join(" ").trim();
    paragraph = [];
    if (content) {
      section().elements.push({ id: newId(), type: "paragraph", content });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (FENCE.test(line)) {
      flushParagraph();
      inFence = !inFence;
      continue;
    }
    // Inside a fence, keep the text verbatim as paragraph lines.
    if (inFence) {
      paragraph.push(line);
      continue;
    }

    if (isBlank(line)) {
      flushParagraph();
      continue;
    }

    if (HR.test(line)) {
      flushParagraph();
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      flushParagraph();
      const [, hashes, rawText] = heading;
      const text = stripInline(rawText);
      if (hashes.length <= 2) {
        current = emptySection(text);
        sections.push(current);
      } else {
        // ###+ refines the section we're already in.
        const s = section();
        s.subheading = s.subheading ? `${s.subheading} ${text}` : text;
      }
      continue;
    }

    if (BULLET.test(line)) {
      flushParagraph();
      // Collect the whole contiguous list, blank lines included, so that a
      // loosely-spaced list still parses as one element.
      const run: { indent: number; text: string }[] = [];
      let j = i;
      while (j < lines.length) {
        const m = lines[j].match(BULLET);
        if (m) {
          run.push({ indent: m[1].length, text: stripInline(m[2]) });
          j++;
          continue;
        }
        // A blank line only continues the list if a bullet follows it.
        if (isBlank(lines[j]) && lines[j + 1]?.match(BULLET)) {
          j++;
          continue;
        }
        break;
      }
      i = j - 1;

      section().elements.push(bulletsToElement(run));
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();

  // Drop sections the parse created but nothing filled.
  return sections.filter(
    (s) => s.heading || s.subheading || s.elements.length > 0,
  );
}

// A run of bullets becomes "bullets" when it's flat, "nested-bullets" when any
// item is indented under another. Levels deeper than two collapse into subItems,
// since the editor only models two.
function bulletsToElement(
  run: { indent: number; text: string }[],
): ContentElement {
  const items = run.filter((r) => r.text);
  const base = Math.min(...items.map((r) => r.indent));
  const hasNesting = items.some((r) => r.indent > base);

  if (!hasNesting) {
    return {
      id: newId(),
      type: "bullets",
      content: "",
      listItems: items.map((r) => r.text),
    };
  }

  const nestedItems: { text: string; subItems: string[] }[] = [];
  for (const item of items) {
    if (item.indent === base) {
      nestedItems.push({ text: item.text, subItems: [] });
    } else if (nestedItems.length) {
      nestedItems[nestedItems.length - 1].subItems.push(item.text);
    } else {
      // Indented bullet with no parent above it — treat it as a top-level one.
      nestedItems.push({ text: item.text, subItems: [] });
    }
  }

  return { id: newId(), type: "nested-bullets", content: "", nestedItems };
}

// Counts what a parsed overview contains, for the import preview.
export function countSectionContent(sections: ContentSectionData[]) {
  return sections.reduce(
    (acc, s) => {
      acc.elements += s.elements.length;
      return acc;
    },
    { sections: sections.length, elements: 0 },
  );
}
