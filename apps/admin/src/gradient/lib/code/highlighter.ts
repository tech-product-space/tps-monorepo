import type { Parser } from "@lezer/common";
import { highlightTree, tagHighlighter, tags as t } from "@lezer/highlight";

import { SYNTAX_COLORS, type SyntaxTokenType } from "@/gradient/lib/code/syntaxColors";

/**
 * Tokenising without an editor.
 *
 * `tagHighlighter` + `highlightTree` are pure functions over a Lezer tree — no
 * `EditorView`, no DOM, no effect — so this drives a ProseMirror decoration in
 * the editor here and server-rendered spans in `gradient-next-ui`, from one
 * grammar and one palette. That is the half of CodeMirror worth reusing; a real
 * editor mounted inside the node view would mean bridging focus and selection
 * between two editors for auto-indent we were not asked for.
 *
 * Classes are the palette's own token names, so a token maps straight onto
 * `SYNTAX_COLORS` and what the author sees is what the reader gets.
 *
 * Kept byte-identical to `gradient-next-ui/lib/code/highlighter.ts` apart from
 * this comment and the palette import — the two must not drift.
 */
const highlighter = tagHighlighter([
  {
    tag: [
      t.keyword,
      t.controlKeyword,
      t.definitionKeyword,
      t.moduleKeyword,
      t.operatorKeyword,
      t.self,
      t.atom,
      t.bool,
      t.null,
      // A tag name is the thing the eye scans an HTML block for; giving it the
      // keyword blue separates it from its attributes.
      t.tagName,
    ],
    class: "keyword",
  },
  {
    tag: [t.string, t.special(t.string), t.character, t.regexp, t.docString],
    class: "string",
  },
  { tag: [t.number, t.integer, t.float], class: "number" },
  {
    tag: [t.comment, t.lineComment, t.blockComment, t.docComment],
    class: "comment",
  },
  {
    tag: [
      t.operator,
      t.arithmeticOperator,
      t.logicOperator,
      t.compareOperator,
      t.definitionOperator,
      t.updateOperator,
      t.derefOperator,
      t.punctuation,
      t.separator,
      t.bracket,
      t.paren,
      t.brace,
      t.squareBracket,
      t.angleBracket,
    ],
    class: "operator",
  },
  {
    tag: [
      t.typeName,
      t.className,
      t.namespace,
      t.propertyName,
      t.attributeName,
      t.standard(t.name),
      t.escape,
    ],
    class: "identifier",
  },
  {
    tag: [
      t.function(t.variableName),
      t.function(t.propertyName),
      t.macroName,
      t.labelName,
    ],
    class: "function",
  },
]);

export interface CodeToken {
  text: string;
  /** null renders in the plain colour — no span needed. */
  type: SyntaxTokenType | null;
}

export const tokenColor = (type: SyntaxTokenType | null): string =>
  SYNTAX_COLORS[type ?? "plain"];

/**
 * Above this, highlighting is skipped and the block renders plain.
 *
 * Lezer parses synchronously, so a pasted 500 KB log would block the main
 * thread painting colours nobody asked for. A snippet in a lesson is never
 * this long; something that is, is not a snippet.
 */
const MAX_HIGHLIGHT_CHARS = 100_000;

/**
 * Splits `code` into coloured runs. Gaps between highlighted ranges come back
 * as untyped tokens, so concatenating every `text` reproduces the input exactly
 * — the renderer relies on that to avoid dropping whitespace.
 */
export function tokenize(code: string, parser: Parser | null): CodeToken[] {
  if (!code) return [];
  if (!parser || code.length > MAX_HIGHLIGHT_CHARS) {
    return [{ text: code, type: null }];
  }

  let tree;
  try {
    tree = parser.parse(code);
  } catch {
    // A fragment that is not valid in its language still has to render.
    return [{ text: code, type: null }];
  }

  const tokens: CodeToken[] = [];
  let pos = 0;

  highlightTree(tree, highlighter, (from, to, classes) => {
    if (from > pos) tokens.push({ text: code.slice(pos, from), type: null });
    // One highlighter, but a node carrying several tags yields several classes;
    // the first is the most specific match.
    const type = classes.split(" ")[0] as SyntaxTokenType;
    tokens.push({ text: code.slice(from, to), type: type in SYNTAX_COLORS ? type : null });
    pos = to;
  });

  if (pos < code.length) tokens.push({ text: code.slice(pos), type: null });

  return tokens;
}
