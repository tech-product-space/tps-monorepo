// Single source of truth for the code block's language handling, shared by the
// editor dropdown, file-import extension mapping, and fence parsing (docx/paste).
//
// There is no syntax highlighter — `language` is only a label (the pill) and a
// semantic tag. So nothing is rejected: an unknown token is kept as-is and shown
// verbatim. The curated list below just powers the manual dropdown.

export interface CodeLanguage {
  value: string;
  label: string;
}

// Curated options for the manual dropdown in CodeBlock.
export const CODE_LANGUAGES: CodeLanguage[] = [
  { value: "plaintext", label: "Plain text" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "jsx", label: "JSX" },
  { value: "tsx", label: "TSX" },
  { value: "python", label: "Python" },
  { value: "java", label: "Java" },
  { value: "c", label: "C" },
  { value: "cpp", label: "C++" },
  { value: "go", label: "Go" },
  { value: "rust", label: "Rust" },
  { value: "sql", label: "SQL" },
  { value: "bash", label: "Bash / Shell" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
];

// Common fence tokens / aliases -> canonical value above.
const LANG_ALIASES: Record<string, string> = {
  js: "javascript",
  node: "javascript",
  ts: "typescript",
  py: "python",
  python3: "python",
  "c++": "cpp",
  cc: "cpp",
  golang: "go",
  rs: "rust",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  yml: "yaml",
  text: "plaintext",
  txt: "plaintext",
  plain: "plaintext",
};

// File extension -> canonical language, for the "Import from file" button.
const EXT_TO_LANG: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  jsx: "jsx",
  tsx: "tsx",
  py: "python",
  java: "java",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  hpp: "cpp",
  go: "go",
  rs: "rust",
  sql: "sql",
  sh: "bash",
  bash: "bash",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  html: "html",
  htm: "html",
  css: "css",
  txt: "plaintext",
};

// Extensions the file picker advertises (mirrors EXT_TO_LANG keys).
export const CODE_FILE_ACCEPT = Object.keys(EXT_TO_LANG)
  .map((e) => `.${e}`)
  .join(",");

/**
 * Normalizes a fence/dropdown token to a canonical language. Lowercases, trims,
 * strips a leading dot, and resolves aliases. Empty -> "plaintext". An unknown
 * token is returned as-is (lowercased) so it still labels the block.
 */
export function normalizeLang(raw: string | undefined | null): string {
  const t = (raw ?? "").trim().toLowerCase().replace(/^\./, "");
  if (!t) return "plaintext";
  return LANG_ALIASES[t] ?? t;
}

/** Infers a language from a filename's extension; unknown -> "plaintext". */
export function langFromFilename(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_TO_LANG[ext] ?? "plaintext";
}

/** Human label for a language value; falls back to the raw value uppercased-ish. */
export function langLabel(value: string): string {
  const found = CODE_LANGUAGES.find((l) => l.value === value);
  return found ? found.label : value;
}
