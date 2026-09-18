// Shared triple-backtick fence detection, used by both the .docx import
// (htmlToBlocks) and the paste-into-paragraph path (useQuillPasteSanitizer), so
// the two behave identically. A fence is the single, explicit "this is code"
// signal - there is no fuzzy detection.

import { normalizeLang } from "@/components/block-editor/utils/codeLanguages";

// Opening fence: >=3 backticks, up to 3 leading spaces, optional language token.
// Closing fence: >=3 backticks, up to 3 leading spaces, nothing else.
const OPEN_FENCE = /^ {0,3}`{3,}\s*([\w+#.-]*)\s*$/;
const CLOSE_FENCE = /^ {0,3}`{3,}\s*$/;

// Google-Docs autocorrect artifacts that silently corrupt code.
const CURLY_DOUBLE = /[“”]/g; // “ ”
const CURLY_SINGLE = /[‘’]/g; // ‘ ’
const ODD_SPACES = /[      ]/g; // nbsp/en/em/figure/thin/narrow

export const isOpenFence = (line: string): RegExpMatchArray | null =>
  line.match(OPEN_FENCE);

export const isCloseFence = (line: string): boolean => CLOSE_FENCE.test(line);

/** Reads the language token off an opening fence line (normalized). */
export const fenceLanguage = (openLine: string): string =>
  normalizeLang(isOpenFence(openLine)?.[1] ?? "");

/**
 * Cleans autocorrect artifacts that silently corrupt code: curly quotes become
 * straight quotes and non-breaking / exotic spaces become a normal space.
 * Everything else is left byte-for-byte.
 */
export function cleanCodeText(code: string): string {
  return code
    .replace(CURLY_DOUBLE, '"')
    .replace(CURLY_SINGLE, "'")
    .replace(ODD_SPACES, " ");
}

export interface FencedBlock {
  language: string;
  code: string;
}

/**
 * Parses a self-contained fenced block out of a plain-text string (used by the
 * paste path). Returns null unless the text is *exactly* one fenced block:
 * first non-empty line opens a fence and a later line closes it, so ordinary
 * prose is never captured. Trailing non-blank lines after the close disqualify it.
 */
export function parseSingleFencedBlock(text: string): FencedBlock | null {
  if (!text) return null;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  let start = 0;
  while (start < lines.length && lines[start].trim() === "") start++;
  if (start >= lines.length) return null;

  const open = isOpenFence(lines[start]);
  if (!open) return null;

  const body: string[] = [];
  let closed = false;
  let i = start + 1;
  for (; i < lines.length; i++) {
    if (isCloseFence(lines[i])) {
      closed = true;
      break;
    }
    body.push(lines[i]);
  }
  if (!closed) return null;

  // Anything other than blanks after the closing fence => not a pure code paste.
  for (let j = i + 1; j < lines.length; j++) {
    if (lines[j].trim() !== "") return null;
  }

  return {
    language: normalizeLang(open[1] ?? ""),
    code: cleanCodeText(body.join("\n")),
  };
}
