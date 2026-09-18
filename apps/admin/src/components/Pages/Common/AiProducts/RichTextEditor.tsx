"use client";

import React, { useEffect, useRef } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Heading3,
  RemoveFormatting,
} from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
};

// Cleans HTML pasted from Google Docs / ChatGPT / Claude / Notion before
// ProseMirror parses it: any heading level becomes h3 — the only level our
// schema allows — otherwise pasted h1/h2 silently degrade to plain
// paragraphs. Everything else (bold via span styles, Google Docs'
// font-weight:normal <b> wrapper, lists, links) is already handled correctly
// by the extensions' built-in parse rules.
const normalizePastedHtml = (html: string): string =>
  html.replace(/<(\/?)h[1-6]((?:\s[^>]*)?)>/gi, "<$1h3$2>");

// Produces the exact HTML element set the public ProductDetail renderer
// styles: p, h3, strong, em, u, ul/ol/li, blockquote, a. Keep the toolbar
// limited to those.
export default function RichTextEditor({ value, onChange, placeholder }: Props) {
  // Tracks the last HTML this editor itself emitted. The sync effect below
  // only resets the document when the prop changes for some OTHER reason
  // (e.g. data loaded). Resetting in response to our own onChange echo would
  // replace the document mid-edit and invalidate the user's selection,
  // making formatting commands land on the wrong text.
  const lastEmittedHtml = useRef<string>(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [3] },
        codeBlock: false,
        code: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: placeholder || "Write here…" }),
    ],
    content: value,
    immediatelyRender: false,
    // Toolbar active states (isActive) must update on every transaction.
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: "rte-content min-h-[140px] px-3 py-2 text-sm focus:outline-none",
      },
      transformPastedHTML: normalizePastedHtml,
    },
    onUpdate: ({ editor }) => {
      const html = editor.isEmpty ? "" : editor.getHTML();
      lastEmittedHtml.current = html;
      onChange(html);
    },
  });

  // Sync genuine external value changes only (e.g. product data loaded).
  useEffect(() => {
    if (!editor) return;
    if (value === lastEmittedHtml.current) return;
    lastEmittedHtml.current = value;
    editor.commands.setContent(value || "");
  }, [editor, value]);

  if (!editor) return null;

  const setLink = () => {
    const prev = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", prev || "https://");
    if (url === null) return;
    if (url === "" || url === "https://") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  const ToolbarButton = ({
    active,
    onClick,
    title,
    children,
  }: {
    active?: boolean;
    onClick: () => void;
    title: string;
    children: React.ReactNode;
  }) => (
    <Button
      type="button"
      size="icon"
      variant={active ? "secondary" : "ghost"}
      className="h-7 w-7"
      title={title}
      onMouseDown={(e) => e.preventDefault()} // keep editor selection
      onClick={onClick}
    >
      {children}
    </Button>
  );

  return (
    <div className="border rounded-md bg-white">
      <div className="flex items-center gap-0.5 border-b px-2 py-1 flex-wrap">
        <ToolbarButton
          title="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Subheading"
          active={editor.isActive("heading", { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          <Heading3 size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Bullet list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <List size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote size={14} />
        </ToolbarButton>
        <ToolbarButton title="Link" active={editor.isActive("link")} onClick={setLink}>
          <LinkIcon size={14} />
        </ToolbarButton>
        <ToolbarButton
          title="Clear formatting"
          onClick={() =>
            editor.chain().focus().clearNodes().unsetAllMarks().run()
          }
        >
          <RemoveFormatting size={14} />
        </ToolbarButton>
      </div>

      <EditorContent editor={editor} />

      {/* Editor content styling — mirrors the public ProductDetail renderer
          so what admins see is what the website shows. */}
      <style>{`
        .rte-content p { margin: 0.5rem 0; line-height: 1.65; }
        .rte-content h3 { font-size: 1.05rem; font-weight: 600; margin: 0.9rem 0 0.35rem; }
        .rte-content ul { list-style: disc outside !important; padding-left: 1.5rem !important; margin: 0.5rem 0 !important; }
        .rte-content ol { list-style: decimal outside !important; padding-left: 1.5rem !important; margin: 0.5rem 0 !important; }
        .rte-content li { display: list-item !important; margin: 0.15rem 0; }
        .rte-content li > p { margin: 0; }
        .rte-content ul ul { list-style-type: circle !important; margin: 0.1rem 0 !important; }
        .rte-content blockquote { border-left: 3px solid #d1d5db; padding-left: 0.75rem; color: #4b5563; margin: 0.6rem 0; }
        .rte-content blockquote p { margin: 0.25rem 0; }
        .rte-content a { color: #2563eb; text-decoration: underline; }
        .rte-content p.is-editor-empty:first-child::before {
          color: #9ca3af;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
