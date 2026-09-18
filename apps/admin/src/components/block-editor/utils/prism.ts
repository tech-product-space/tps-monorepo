// Prism-based syntax highlighting for code blocks (editor + preview). Pure
// functions — Prism.highlight escapes the input and returns token markup, so the
// result is safe to inject. Language grammars are registered on import below.

import Prism from "prismjs";
// Core already ships markup / css / clike / javascript. Order matters: a grammar
// must load after the one it extends (cpp<-c, tsx<-jsx+typescript).
import "prismjs/components/prism-python";
import "prismjs/components/prism-java";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-tsx";

// Our language value -> Prism grammar id.
const PRISM_ID: Record<string, string> = {
  javascript: "javascript",
  typescript: "typescript",
  jsx: "jsx",
  tsx: "tsx",
  python: "python",
  java: "java",
  c: "c",
  cpp: "cpp",
  go: "go",
  rust: "rust",
  sql: "sql",
  bash: "bash",
  json: "json",
  yaml: "yaml",
  html: "markup",
  css: "css",
};

const escapeHtml = (s: string): string =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export interface Highlighted {
  id: string | null; // Prism grammar id, or null when unhighlighted
  html: string; // token markup, already escaped
}

/**
 * Highlights code for the given language. Unknown / plaintext languages fall
 * back to escaped plain text (no colors) so nothing ever renders raw HTML.
 */
export function highlightCode(code: string, language: string): Highlighted {
  const id = PRISM_ID[language] ?? null;
  const grammar = id ? Prism.languages[id] : null;
  if (!id || !grammar) return { id: null, html: escapeHtml(code) };
  return { id, html: Prism.highlight(code, grammar, id) };
}

export interface TokenRange {
  from: number;
  to: number;
  /** Prism's own class names, so the `.prism-code-dark` theme applies as-is. */
  className: string;
}

/**
 * Flat, absolute token ranges for a snippet — what a ProseMirror decoration
 * plugin needs, as opposed to the HTML string `highlightCode` returns.
 *
 * Ranges rather than markup because in an editor the text belongs to the
 * document and only the colour is presentation. Writing highlight markup into
 * the document would make opening a lesson an edit to it.
 */
export function tokenizeCode(code: string, language: string): TokenRange[] {
  const id = PRISM_ID[language] ?? null;
  const grammar = id ? Prism.languages[id] : null;
  if (!id || !grammar) return [];

  const ranges: TokenRange[] = [];
  let offset = 0;

  const walk = (nodes: (string | Prism.Token)[]) => {
    for (const node of nodes) {
      if (typeof node === "string") {
        offset += node.length;
        continue;
      }

      const start = offset;
      const content = node.content;

      if (typeof content === "string") {
        offset += content.length;
      } else if (Array.isArray(content)) {
        walk(content as (string | Prism.Token)[]);
      } else {
        walk([content as Prism.Token]);
      }

      // Emitted after the children so a nested token's own colour, pushed
      // first, is not overridden by its parent's broader range.
      const alias = Array.isArray(node.alias)
        ? node.alias.join(" ")
        : node.alias || "";

      ranges.push({
        from: start,
        to: offset,
        className: `token ${node.type}${alias ? ` ${alias}` : ""}`,
      });
    }
  };

  walk(Prism.tokenize(code, grammar) as (string | Prism.Token)[]);

  return ranges;
}
