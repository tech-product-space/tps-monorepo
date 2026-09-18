"use client";

import { useState } from "react";
import CodeBlock from "@tiptap/extension-code-block";
import {
  NodeViewContent,
  NodeViewProps,
  NodeViewWrapper,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Check, Copy } from "lucide-react";

import {
  CODE_LANGUAGES,
  langLabel,
  normalizeLang,
} from "@/components/block-editor/utils/codeLanguages";
import { tokenizeCode } from "@/components/block-editor/utils/prism";

/**
 * The single-language code block: a language picker, a copy button, and colour.
 *
 * It is the stock `codeBlock` node with a node view and a decoration plugin
 * bolted on — **no new node type**. That matters more than it looks: the
 * document schema is what the .docx importer parses against and what the public
 * renderer reads back, so a node defined here and nowhere else would be dropped
 * the moment a lesson was opened elsewhere. Nothing here touches the schema, and
 * a document that already contains a ``` block starts rendering correctly with
 * no migration.
 *
 * **Colour is applied as decorations, which are view state, not document
 * state.** The editor's dirty check compares documents; a highlighter that wrote
 * its markup into the content would mark every lesson edited the moment it was
 * opened, and every lesson switch would stop to ask about changes nobody made.
 */

const codeBlockHighlight = new PluginKey("codeBlockHighlight");

/** Inline decorations for every code block in the document. */
function buildDecorations(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== "codeBlock") return;

    const language = normalizeLang(node.attrs.language ?? "");
    const ranges = tokenizeCode(node.textContent, language);

    // +1 to step inside the node: a code block holds plain text, so offsets
    // within it map one-to-one onto document positions.
    const start = pos + 1;

    for (const range of ranges) {
      decorations.push(
        Decoration.inline(start + range.from, start + range.to, {
          class: range.className,
        }),
      );
    }

    return false; // nothing inside a code block needs walking
  });

  return DecorationSet.create(doc, decorations);
}

function CodeBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  const [copied, setCopied] = useState(false);

  const language = normalizeLang(node.attrs.language ?? "");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(node.textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // A clipboard the browser refuses is not worth an error dialog; the code
      // is on screen and selectable.
    }
  };

  return (
    <NodeViewWrapper className="tiptap-codeblock prism-code-dark">
      {/* contentEditable={false} so the toolbar is chrome, not text: without it
          a click here would put the caret in the header and typing would go
          nowhere. */}
      <div className="tiptap-codeblock-bar" contentEditable={false}>
        <select
          value={language}
          disabled={!editor.isEditable}
          onChange={(e) => updateAttributes({ language: e.target.value })}
          aria-label="Code language"
        >
          {CODE_LANGUAGES.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {langLabel(entry.value)}
            </option>
          ))}
        </select>

        <button type="button" onClick={copy} aria-label="Copy code">
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <pre>
        <NodeViewContent as="code" />
      </pre>
    </NodeViewWrapper>
  );
}

export const HighlightedCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView);
  },

  addProseMirrorPlugins() {
    return [
      ...(this.parent?.() ?? []),
      new Plugin({
        key: codeBlockHighlight,
        state: {
          init: (_, { doc }) => buildDecorations(doc),
          // Rebuilt only when the document actually changed — a plain cursor
          // move must not re-tokenize every block on the page.
          apply: (tr, previous) =>
            tr.docChanged ? buildDecorations(tr.doc) : previous,
        },
        props: {
          decorations(state) {
            return codeBlockHighlight.getState(state);
          },
        },
      }),
    ];
  },
});
