import type { Parser } from "@lezer/common";
import type { StreamParser } from "@codemirror/language";

/**
 * The languages a code block can be written in.
 *
 * Every entry needs a parser we actually ship, so this list is curated rather
 * than exhaustive — a label with no grammar behind it is a dropdown entry that
 * silently renders plain. `plaintext` is the one deliberate null: it is the
 * honest answer for output, logs and file trees.
 *
 * Loaders are dynamic imports, so a reader downloads the grammar for the one
 * language on the page rather than all fourteen.
 */

export type CodeLanguageId =
  | "plaintext"
  | "python"
  | "javascript"
  | "typescript"
  | "sql"
  | "json"
  | "bash"
  | "r"
  | "java"
  | "c"
  | "cpp"
  | "html"
  | "css"
  | "yaml";

interface CodeLanguageSpec {
  label: string;
  /** null means "render as plain text" — there is nothing to parse with. */
  load: (() => Promise<Parser>) | null;
}

/**
 * A stream parser is a legacy CodeMirror 5 mode, not a Lezer grammar, so it has
 * to be wrapped before it can produce a tree. `@codemirror/language` is only
 * pulled in when one of those languages is actually used.
 */
async function fromStreamMode(mode: StreamParser<unknown>): Promise<Parser> {
  const { StreamLanguage } = await import("@codemirror/language");
  return StreamLanguage.define(mode).parser;
}

/**
 * Total over `CodeLanguageId`, so adding an id without giving it a label and a
 * loader is a build error rather than a block that mysteriously renders plain.
 * Declaration order is the order of the editor's dropdown.
 */
export const CODE_LANGUAGES: Record<CodeLanguageId, CodeLanguageSpec> = {
  plaintext: { label: "Plain text", load: null },
  python: {
    label: "Python",
    load: async () =>
      (await import("@codemirror/lang-python")).pythonLanguage.parser,
  },
  javascript: {
    label: "JavaScript",
    load: async () =>
      (await import("@codemirror/lang-javascript")).javascriptLanguage.parser,
  },
  typescript: {
    label: "TypeScript",
    load: async () =>
      (await import("@codemirror/lang-javascript")).typescriptLanguage.parser,
  },
  sql: {
    label: "SQL",
    load: async () =>
      (await import("@codemirror/lang-sql")).StandardSQL.language.parser,
  },
  json: {
    label: "JSON",
    load: async () => (await import("@codemirror/lang-json")).jsonLanguage.parser,
  },
  bash: {
    label: "Bash",
    load: async () =>
      fromStreamMode((await import("@codemirror/legacy-modes/mode/shell")).shell),
  },
  r: {
    label: "R",
    load: async () =>
      fromStreamMode((await import("@codemirror/legacy-modes/mode/r")).r),
  },
  java: {
    label: "Java",
    load: async () => (await import("@codemirror/lang-java")).javaLanguage.parser,
  },
  c: {
    label: "C",
    load: async () => (await import("@codemirror/lang-cpp")).cppLanguage.parser,
  },
  cpp: {
    label: "C++",
    load: async () => (await import("@codemirror/lang-cpp")).cppLanguage.parser,
  },
  html: {
    label: "HTML",
    load: async () => (await import("@codemirror/lang-html")).htmlLanguage.parser,
  },
  css: {
    label: "CSS",
    load: async () => (await import("@codemirror/lang-css")).cssLanguage.parser,
  },
  yaml: {
    label: "YAML",
    load: async () => (await import("@codemirror/lang-yaml")).yamlLanguage.parser,
  },
};

export const CODE_LANGUAGE_IDS = Object.keys(CODE_LANGUAGES) as CodeLanguageId[];

export const languageLabel = (id: CodeLanguageId): string =>
  CODE_LANGUAGES[id].label;

/**
 * What authors actually type on a fence or paste into the language field.
 * Anything not listed here falls back to `plaintext`.
 */
const ALIASES: Record<string, CodeLanguageId> = {
  py: "python",
  python3: "python",
  js: "javascript",
  node: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  postgres: "sql",
  postgresql: "sql",
  mysql: "sql",
  sh: "bash",
  shell: "bash",
  zsh: "bash",
  console: "bash",
  terminal: "bash",
  "c++": "cpp",
  cplusplus: "cpp",
  htm: "html",
  yml: "yaml",
  text: "plaintext",
  txt: "plaintext",
  plain: "plaintext",
  none: "plaintext",
};

export function isCodeLanguageId(value: unknown): value is CodeLanguageId {
  return typeof value === "string" && value in CODE_LANGUAGES;
}

/**
 * Resolves whatever was stored on the node or written on a fence to an id we
 * can highlight. Unknown names become `plaintext` rather than throwing — a
 * lesson with a typo in it still has to render.
 */
export function normaliseLanguage(value: unknown): CodeLanguageId {
  if (typeof value !== "string") return "plaintext";
  const key = value.trim().toLowerCase();
  if (!key) return "plaintext";
  if (isCodeLanguageId(key)) return key;
  return ALIASES[key] ?? "plaintext";
}

/**
 * Parsers are cached by id, and in-flight loads are shared: a lesson with six
 * Python blocks imports the grammar once, not six times.
 */
const parsers = new Map<CodeLanguageId, Parser>();
const pending = new Map<CodeLanguageId, Promise<Parser | null>>();

export const cachedParser = (id: CodeLanguageId): Parser | null =>
  parsers.get(id) ?? null;

export function loadParser(id: CodeLanguageId): Promise<Parser | null> {
  const ready = parsers.get(id);
  if (ready) return Promise.resolve(ready);

  const inFlight = pending.get(id);
  if (inFlight) return inFlight;

  const { load } = CODE_LANGUAGES[id];
  if (!load) return Promise.resolve(null);

  const promise = load()
    .then((parser) => {
      parsers.set(id, parser);
      return parser;
    })
    .catch(() => {
      // A grammar chunk that fails to load leaves the block plain, which is
      // exactly what it already looks like. Nothing useful to say about it.
      return null;
    })
    .finally(() => {
      pending.delete(id);
    });

  pending.set(id, promise);
  return promise;
}
