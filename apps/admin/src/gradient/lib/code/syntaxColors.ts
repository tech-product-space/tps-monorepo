/**
 * The code palette, mirroring `gradient-next-ui/lib/tools/syntaxColors.ts`.
 *
 * Copied rather than imported because the two repos share no code. These eight
 * values are the contract between them: a keyword must be the same blue in this
 * editor as it is in the published post, or an author is colour-matching
 * against something the reader never sees. Change one side, change the other.
 */
export const SYNTAX_COLORS = {
  keyword: "#0090FF",
  string: "#7FD88F",
  number: "#E5C07B",
  comment: "#6B6B6B",
  operator: "#A3A3A3",
  /** Quoted identifiers, type names, object keys, HTML attributes. */
  identifier: "#4FC1FF",
  function: "#DCDCAA",
  plain: "#E8E8E8",
} as const;

export type SyntaxTokenType = keyof typeof SYNTAX_COLORS;
