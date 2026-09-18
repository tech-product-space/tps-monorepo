import { BlockType, IBlockBase } from "../types/block.types";
import { createCard, createHeader, createParagraph } from "./blockFactory";
import {
  cleanQuillHTML,
  demoteToParagraphHTML,
  normalizeHeadingHTML,
} from "./quillNormalizers";

// Only the text blocks convert into one another.
//
// Layout is excluded because it owns `children` — converting one would orphan
// them — and because every root block is a layout, an invariant the drag rules
// depend on. Table is excluded because Quill has no table format, so a table
// would decay into loose text. Image/video/youtube are excluded because their
// payloads can't transfer: an image holds an S3 key of a picture, a video holds
// one of a video file, YouTube holds a URL. "Converting" between them leaves an
// empty block you have to refill, which is a delete and re-add, not a conversion.
export const CONVERTIBLE_TYPES = ["header", "paragraph", "card"] as const;

export type ConvertibleType = (typeof CONVERTIBLE_TYPES)[number];

export const BLOCK_TYPE_LABELS: Record<ConvertibleType, string> = {
  header: "Header",
  paragraph: "Paragraph",
  card: "Card",
};

export const isConvertible = (type: BlockType): type is ConvertibleType =>
  (CONVERTIBLE_TYPES as readonly string[]).includes(type);

const toTargetHtml = (html: string, target: ConvertibleType): string => {
  if (target === "header") return normalizeHeadingHTML(html);
  if (target === "card") return cleanQuillHTML(html);
  return demoteToParagraphHTML(html);
};

const createFor = (target: ConvertibleType): IBlockBase => {
  if (target === "header") return createHeader();
  if (target === "card") return createCard();
  return createParagraph();
};

const textOf = (html: string): string => {
  if (!html) return "";
  if (typeof DOMParser === "undefined") return html;

  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
};

export interface BlockConversion {
  block: IBlockBase;
  /**
   * Set only when the conversion deletes visible text — `kept` is what survives
   * (empty string when nothing does). Losing formatting alone doesn't count:
   * shedding a heading tag is the whole point of converting to a paragraph.
   */
  textLoss: { kept: string } | null;
}

/**
 * Builds the converted block without committing it, so a caller can inspect
 * `textLoss` and confirm before anything is destroyed.
 */
export function convertBlock(
  source: IBlockBase,
  target: ConvertibleType,
): BlockConversion {
  const sourceHtml = source.data?.html ?? "";
  const html = toTargetHtml(sourceHtml, target);

  // Built from the factory rather than spread from the source: `data` is an
  // unvalidated Record, so spreading would persist dead keys (a Card's `variant`
  // on a Paragraph) into JSONB forever.
  const fresh = createFor(target);
  const block: IBlockBase = {
    ...fresh,
    // Identity is positional — a fresh id would churn drag and React state.
    id: source.id,
    data: { ...fresh.data, html },
  };

  const before = textOf(sourceHtml);
  const after = textOf(html);

  return { block, textLoss: before === after ? null : { kept: after } };
}
