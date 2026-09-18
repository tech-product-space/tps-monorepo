"use client";

import { useEditor, EditorContent } from "@tiptap/react";

import { createEditorExtensions } from "./TiptapEditor";
import "./TiptapEditor.css";

/**
 * Read-only view of a stored Tiptap document.
 *
 * Parses against `createEditorExtensions` — the same list the editor writes
 * with — so what the preview shows is what the document actually contains, not
 * a second interpretation of it that can drift.
 */
export function TiptapDocPreview({ doc }: { doc: object | null | undefined }) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    content: doc ?? undefined,
    extensions: createEditorExtensions(),
    editorProps: { attributes: { class: "tiptap-content" } },
  });

  if (!editor) return null;

  return <EditorContent editor={editor} />;
}
