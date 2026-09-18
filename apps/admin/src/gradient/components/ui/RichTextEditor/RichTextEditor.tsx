"use client";

import { useCallback, useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
// v3 consolidated the small utility extensions into this package; there is
// no `@tiptap/extension-placeholder` at this major.
import { Placeholder } from "@tiptap/extensions";
import {
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
  Unlink,
} from "lucide-react";

import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Separator } from "@/gradient/components/ui/separator";
import { cn } from "@/gradient/lib/utils";

import "./RichTextEditor.css";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * A small prose editor: paragraphs, headings, lists, links, and the usual marks.
 *
 * Deliberately not `TiptapEditor` (the blog editor) — that one emits ProseMirror
 * JSON plus a table of contents, wants an upload context, and carries code
 * blocks, tables, images, YouTube embeds and a colour palette. A "why this topic
 * matters" paragraph needs none of it, and its output shape would not fit in a
 * JSONB text field.
 *
 * Deliberately not `EmailEditor` either: that is `document.execCommand` over a
 * contentEditable, and it emits email-flavoured HTML (inline styles, tables) so
 * that Outlook renders it. Wrong output for a web page.
 *
 * **Emits HTML, not JSON.** The public site drops this straight into the page,
 * so the stored value should be the thing that renders. Tiptap only ever
 * serialises its own schema, so the HTML is constrained to the marks below —
 * there is no path from this editor to a `<script>` tag.
 */
export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  className,
}: Props) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const editor = useEditor({
    // Next renders this on the server first; without it Tiptap warns about a
    // hydration mismatch on every mount.
    immediatelyRender: false,
    extensions: [
      // StarterKit v3 already bundles link, underline and the list nodes.
      // Registering them again warns about duplicate extension names and leaves
      // it ambiguous which config wins — configure through StarterKit instead.
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        horizontalRule: false,
        link: {
          openOnClick: false,
          autolink: true,
          // Anything not in this list is dropped rather than rendered, so a
          // pasted `javascript:` URL cannot survive into the published page.
          protocols: ["http", "https", "mailto"],
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
      Placeholder.configure({ placeholder: placeholder ?? "Write something…" }),
    ],
    content: value || "",
    editorProps: { attributes: { class: "rte-content" } },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      // Tiptap's "empty" is one bare paragraph. Storing that would make a block
      // that was never filled in look filled, and the public page renders a
      // stray gap instead of hiding the section.
      onChange(html === "<p></p>" ? "" : html);
    },
  });

  /**
   * Pulls external changes in without fighting the user's cursor.
   *
   * `setContent` resets the selection, so it must only run when the incoming
   * value genuinely differs from what the editor already holds — otherwise
   * every keystroke round-trips through the parent and jumps the caret to the
   * start.
   */
  useEffect(() => {
    if (!editor) return;

    const current = editor.getHTML();
    const incoming = value || "";

    if (incoming !== current && !(incoming === "" && current === "<p></p>")) {
      editor.commands.setContent(incoming, { emitUpdate: false });
    }
  }, [value, editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;

    const url = linkUrl.trim();

    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      // A bare "gradient.co.in" is what people paste; without a scheme the
      // browser resolves it relative to the admin panel's own domain.
      const href = /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`;

      editor
        .chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href })
        .run();
    }

    setLinkOpen(false);
    setLinkUrl("");
  }, [editor, linkUrl]);

  if (!editor) {
    return (
      <div className="h-40 animate-pulse rounded-md border bg-muted/40" />
    );
  }

  const Tool = ({
    icon: Icon,
    label,
    active,
    onClick,
    disabled,
  }: {
    icon: typeof Bold;
    label: string;
    active?: boolean;
    onClick: () => void;
    disabled?: boolean;
  }) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      className={cn("h-8 w-8", active && "bg-muted text-foreground")}
      onClick={onClick}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );

  return (
    <div className={cn("rounded-md border", className)}>
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 p-1">
        <select
          className="h-8 rounded border-0 bg-transparent px-2 text-sm outline-none"
          value={
            editor.isActive("heading", { level: 2 })
              ? "h2"
              : editor.isActive("heading", { level: 3 })
                ? "h3"
                : "p"
          }
          onChange={(e) => {
            const chain = editor.chain().focus();
            if (e.target.value === "p") chain.setParagraph().run();
            else
              chain
                .toggleHeading({ level: e.target.value === "h2" ? 2 : 3 })
                .run();
          }}
        >
          <option value="p">Paragraph</option>
          <option value="h2">Heading</option>
          <option value="h3">Subheading</option>
        </select>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Tool
          icon={Bold}
          label="Bold"
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
        />
        <Tool
          icon={Italic}
          label="Italic"
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        />
        <Tool
          icon={UnderlineIcon}
          label="Underline"
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        />
        <Tool
          icon={Strikethrough}
          label="Strikethrough"
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        />

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Tool
          icon={List}
          label="Bulleted list"
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        />
        <Tool
          icon={ListOrdered}
          label="Numbered list"
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        />
        <Tool
          icon={Quote}
          label="Quote"
          active={editor.isActive("blockquote")}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        />

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Tool
          icon={LinkIcon}
          label="Add link"
          active={editor.isActive("link")}
          onClick={() => {
            setLinkUrl(editor.getAttributes("link").href ?? "");
            setLinkOpen((open) => !open);
          }}
        />
        <Tool
          icon={Unlink}
          label="Remove link"
          disabled={!editor.isActive("link")}
          onClick={() =>
            editor.chain().focus().extendMarkRange("link").unsetLink().run()
          }
        />
        <Tool
          icon={RemoveFormatting}
          label="Clear formatting"
          onClick={() =>
            editor.chain().focus().unsetAllMarks().clearNodes().run()
          }
        />

        <Separator orientation="vertical" className="mx-1 h-6" />

        <Tool
          icon={Undo2}
          label="Undo"
          disabled={!editor.can().undo()}
          onClick={() => editor.chain().focus().undo().run()}
        />
        <Tool
          icon={Redo2}
          label="Redo"
          disabled={!editor.can().redo()}
          onClick={() => editor.chain().focus().redo().run()}
        />
      </div>

      {linkOpen && (
        <div className="flex items-center gap-2 border-b bg-muted/20 p-2">
          <Input
            autoFocus
            value={linkUrl}
            placeholder="https://…  or  mailto:someone@example.com"
            className="h-8"
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
              if (e.key === "Escape") setLinkOpen(false);
            }}
          />
          <Button type="button" size="sm" onClick={applyLink}>
            Apply
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setLinkOpen(false)}
          >
            Cancel
          </Button>
        </div>
      )}

      <div className="px-3 py-2">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
