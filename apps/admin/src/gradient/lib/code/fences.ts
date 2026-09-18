/**
 * What counts as a code fence, for the editor and the .docx importer alike.
 *
 * The two need different shapes — the importer tests a whole line, the editor's
 * input rule fires on the whitespace that ends one — but they must accept the
 * same *language names*, or an author who types ```Python in a Doc and the same
 * thing in the editor gets a code block from one and nothing from the other.
 * Hence one character class, used to build both.
 *
 * Deliberately wider than TipTap's built-in rule, which is `[a-z]+` and so
 * silently ignores `Python`, `C`, `c++` and `python3`. Whatever is captured
 * goes through `normaliseLanguage`, which lowercases and resolves aliases, so
 * being permissive here costs nothing: an unrecognised name lands on plaintext
 * rather than failing to open a block at all.
 */
const LANGUAGE = "[A-Za-z0-9+#._-]*";

const OPENER = "(?:`{3,}|~{3,})";

/** A fence alone on its line: what the .docx importer matches. */
export const FENCE_LINE = new RegExp(
  `^${OPENER}[ \\t]*(${LANGUAGE})[ \\t]*$`,
);

/**
 * A fence just typed into the editor, ended by a space.
 *
 * Enter does not trigger it — ProseMirror input rules run on text input, and a
 * newline is not text input. Typing the fence and pressing space is the
 * gesture, which is also what TipTap's own rule required.
 */
export const FENCE_INPUT = new RegExp(`^${OPENER}(${LANGUAGE})[\\s\\n]$`);
