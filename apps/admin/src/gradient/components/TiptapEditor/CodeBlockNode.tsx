"use client";

import { useEffect, useRef, useState } from "react";
import {
  NodeViewContent,
  NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import CodeBlock from "@tiptap/extension-code-block";
import { textblockTypeInputRule } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Check, Copy } from "lucide-react";

import {
  CODE_LANGUAGES,
  CODE_LANGUAGE_IDS,
  cachedParser,
  languageLabel,
  loadParser,
  normaliseLanguage,
  type CodeLanguageId,
} from "@/gradient/lib/code/languages";
import { tokenColor, tokenize, type CodeToken } from "@/gradient/lib/code/highlighter";
import { FENCE_INPUT } from "@/gradient/lib/code/fences";

/**
 * The single-language code block: a language picker, a copy button, and colour.
 *
 * It is the stock `codeBlock` node with a node view and a decoration plugin
 * bolted on — no new node type. That matters more than it looks: `nodes.ts` and
 * `importExtensions.ts` are the schema the .docx importer parses against, and a
 * node defined in only one of them is silently dropped the moment a lesson is
 * opened. Nothing here touches the schema, so they cannot drift, and a document
 * that already contains a ``` block starts rendering correctly with no
 * migration.
 *
 * ProseMirror stays the source of truth for the text. Colour is applied as
 * decorations, which are view state, not document state — the dirty check in
 * `LessonContentPage.tsx` compares documents, so a highlighter that wrote to
 * `attrs` would mark every lesson edited the moment it was opened.
 */

// ─── Shared editing-surface pieces ────────────────────────────────────────────

/**
 * Plain until the grammar chunk lands, then coloured. `cachedParser` is checked
 * synchronously so a second Python block never flashes plain.
 *
 * Used by the tabbed block, which paints its own overlay. The single-language
 * block below is coloured by the decoration plugin instead.
 */
export function useCodeTokens(
  code: string,
  language: CodeLanguageId,
): CodeToken[] {
  const [tokens, setTokens] = useState<CodeToken[]>(() =>
    tokenize(code, cachedParser(language)),
  );

  useEffect(() => {
    setTokens(tokenize(code, cachedParser(language)));

    if (cachedParser(language) || !CODE_LANGUAGES[language].load) return;

    let cancelled = false;
    void loadParser(language).then((parser) => {
      if (!cancelled && parser) setTokens(tokenize(code, parser));
    });

    return () => {
      cancelled = true;
    };
  }, [code, language]);

  return tokens;
}

export function CopyCodeButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const copy = () => {
    void navigator.clipboard?.writeText(value).catch(() => {
      /* Clipboard denied by the browser; nothing useful to say about it. */
    });
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      // The button sits inside a node view; without this the editor takes the
      // selection back and the click lands on nothing.
      onMouseDown={(e) => e.preventDefault()}
      onClick={copy}
      className="tiptap-code-copy"
      data-copied={copied || undefined}
      aria-label={copied ? "Copied" : "Copy code"}
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

// ─── Highlight decorations ────────────────────────────────────────────────────

export const codeHighlightKey = new PluginKey("codeBlockHighlight");

function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "codeBlock") return;

    const parser = cachedParser(normaliseLanguage(node.attrs.language));
    if (!parser) return; // Grammar still loading — the block stays plain.

    // A code block holds nothing but text, so a character offset from the
    // node's content start is a valid document position.
    let offset = pos + 1;
    for (const token of tokenize(node.textContent, parser)) {
      if (token.type) {
        decorations.push(
          Decoration.inline(offset, offset + token.text.length, {
            style: `color: ${tokenColor(token.type)}`,
          }),
        );
      }
      offset += token.text.length;
    }
  });

  return DecorationSet.create(doc, decorations);
}

function codeHighlightPlugin() {
  return new Plugin({
    key: codeHighlightKey,
    state: {
      init: (_config, state) => buildDecorations(state.doc),
      apply: (tr, previous) =>
        // A grammar finishing its load changes no document, so the node view
        // signals with a meta rather than a no-op edit.
        tr.docChanged || tr.getMeta(codeHighlightKey)
          ? buildDecorations(tr.doc)
          : previous,
    },
    props: {
      decorations(state) {
        return codeHighlightKey.getState(state) as DecorationSet | undefined;
      },
    },
  });
}

// ─── Node view ────────────────────────────────────────────────────────────────

function CodeBlockNodeView({ node, updateAttributes, editor }: NodeViewProps) {
  const language = normaliseLanguage(node.attrs.language);

  // Nothing to paint until the grammar is in. Once it is, ask the plugin to
  // rebuild — every block in this language recolours at once.
  useEffect(() => {
    if (cachedParser(language) || !CODE_LANGUAGES[language].load) return;

    let cancelled = false;
    void loadParser(language).then((parser) => {
      if (cancelled || !parser || editor.isDestroyed) return;
      editor.view.dispatch(editor.state.tr.setMeta(codeHighlightKey, true));
    });

    return () => {
      cancelled = true;
    };
  }, [language, editor]);

  return (
    <NodeViewWrapper className="tiptap-code-block">
      <div className="tiptap-code-header" contentEditable={false}>
        <select
          className="tiptap-code-lang-select"
          value={language}
          onChange={(e) => updateAttributes({ language: e.target.value })}
          aria-label="Code language"
        >
          {CODE_LANGUAGE_IDS.map((id) => (
            <option key={id} value={id}>
              {languageLabel(id)}
            </option>
          ))}
        </select>
        <CopyCodeButton value={node.textContent} />
      </div>

      <div className="tiptap-code-body">
        <pre className="tiptap-code-pre">
          {/* `as` is NoInfer'd, so the tag has to be named twice. */}
          <NodeViewContent<"code"> as="code" />
        </pre>
      </div>
    </NodeViewWrapper>
  );
}

export const HighlightedCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockNodeView);
  },

  /**
   * Replaces TipTap's pair of built-in rules rather than adding to them.
   *
   * Theirs capture `[a-z]+`, so typing ```Python, ```C, ```c++ or ```python3
   * opened no block at all and gave the author no clue why — while the .docx
   * importer accepted all four. One shared pattern ends that split, and
   * `normaliseLanguage` does the lowercasing and alias resolution that the
   * narrow character class was standing in for.
   */
  addInputRules() {
    return [
      textblockTypeInputRule({
        find: FENCE_INPUT,
        type: this.type,
        getAttributes: (match) => ({ language: normaliseLanguage(match[1]) }),
      }),
    ];
  },

  addProseMirrorPlugins() {
    // Keep CodeBlock's own plugins — the VS Code paste handler lives in there.
    return [...(this.parent?.() ?? []), codeHighlightPlugin()];
  },
});
