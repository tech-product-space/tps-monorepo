"use client";

import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import {
  Bold,
  Italic,
  Code,
  List,
  ListOrdered,
  Quote,
  CodeSquare,
  Info,
} from "lucide-react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Heading from "@tiptap/extension-heading";
import { TextStyle } from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import ListItem from "@tiptap/extension-list-item";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import Placeholder from "@tiptap/extension-placeholder";

interface AnswerEditorProps {
  initialContent: string;
  onSave: (content: string) => void;
  onCancel: () => void;
  saving?: boolean;
}

export default function AnswerEditor({
  initialContent,
  onSave,
  onCancel,
  saving,
}: AnswerEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Heading.configure({ levels: [1, 2, 3] }),
      TextStyle,
      Color,
      ListItem,
      BulletList,
      OrderedList,
      Placeholder.configure({
        placeholder: "Edit your answer...",
      }),
    ],
    content: initialContent,
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[150px] p-4",
      },
    },
    immediatelyRender: false,
  });

  useEffect(() => {
    if (editor) editor.commands.setContent(initialContent);
  }, [initialContent, editor]);

  // --- Menu Bar ---
  const MenuBar = () => {
    if (!editor) return null;

    const Btn = (icon: any, action: any, active = false) => (
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault();
          action();
        }}
        className={`p-2 rounded hover:bg-muted ${
          active ? "bg-muted" : ""
        }`}
      >
        {icon}
      </button>
    );

    return (
      <div className="flex items-center gap-1 flex-wrap">
        {Btn(
          <Bold className="h-4 w-4" />,
          () => editor.chain().focus().toggleBold().run(),
          editor.isActive("bold")
        )}

        {Btn(
          <Italic className="h-4 w-4" />,
          () => editor.chain().focus().toggleItalic().run(),
          editor.isActive("italic")
        )}

        {Btn(
          <Code className="h-4 w-4" />,
          () => editor.chain().focus().toggleCode().run(),
          editor.isActive("code")
        )}

        {Btn(
          <List className="h-4 w-4" />,
          () => editor.chain().focus().toggleBulletList().run(),
          editor.isActive("bulletList")
        )}

        {Btn(
          <ListOrdered className="h-4 w-4" />,
          () => editor.chain().focus().toggleOrderedList().run(),
          editor.isActive("orderedList")
        )}

        {Btn(
          <Quote className="h-4 w-4" />,
          () => editor.chain().focus().toggleBlockquote().run(),
          editor.isActive("blockquote")
        )}

        {Btn(
          <CodeSquare className="h-4 w-4" />,
          () => editor.chain().focus().toggleCodeBlock().run(),
          editor.isActive("codeBlock")
        )}

        {Btn(<Info className="h-4 w-4" />, () => {})}
      </div>
    );
  };

  // --- Save ---
  const handleSave = () => {
    if (!editor) return;
    const html = editor.getHTML();
    onSave(html);
  };

  return (
    <div className="border border-border rounded-md p-3">
      {/* TOP TOOLBAR */}
      <div className="flex flex-col sm:flex-row justify-between items-center gap-3 mb-3">
        <MenuBar />

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>

          <Button
            size="sm"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* Editor Content */}
      <CardContent className="p-0 tiptap-editor">
        <EditorContent editor={editor} />
      </CardContent>
    </div>
  );
}
