"use client";

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Heading from "@tiptap/extension-heading";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import ListItem from "@tiptap/extension-list-item";
import BulletList from "@tiptap/extension-bullet-list";
import OrderedList from "@tiptap/extension-ordered-list";
import LinkExtension from "@tiptap/extension-link";
import { useState, useEffect } from "react";
import {
  Bold,
  Italic,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Palette,
  Link2,
  Link2Off,
} from "lucide-react";

interface TiptapEditorProps {
  content: string;
  onChange: (content: string) => void;
  className?: string;
  placeholder?: string;
  /** Hide the H1/H2/H3 buttons and disable heading input rules */
  showHeadings?: boolean;
}

const colors = [
  "#000000", // Black
  "#5C5F66", // Dark Gray
  "#868E96", // Gray
  "#E9ECEF", // Light Gray
  "#FF0000", // Red
  "#FFA500", // Orange
  "#FFFF00", // Yellow
  "#008000", // Green
  "#0000FF", // Blue
  "#4B0082", // Indigo
  "#800080", // Purple
];

const MenuBar = ({
  editor,
  showHeadings,
}: {
  editor: Editor | null;
  showHeadings: boolean;
}) => {
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  if (!editor) {
    return null;
  }

  const openLinkInput = () => {
    if (showLinkInput) {
      setShowLinkInput(false);
      return;
    }
    setLinkUrl(editor.getAttributes("link").href || "");
    setShowLinkInput(true);
  };

  const applyLink = () => {
    const url = linkUrl.trim();
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      const href = /^(https?:\/\/|mailto:|tel:)/i.test(url)
        ? url
        : `https://${url}`;
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setShowLinkInput(false);
    setLinkUrl("");
  };

  return (
    <div className="border-b border-gray-200 bg-white p-2 rounded-t-md flex flex-wrap gap-1 items-center">
      <button
        onClick={() => editor.chain().focus().toggleBold().run()}
        disabled={!editor.can().chain().focus().toggleBold().run()}
        className={`p-1 rounded hover:bg-gray-100 ${
          editor.isActive("bold") ? "bg-gray-200" : ""
        }`}
        title="Bold"
        type="button"
      >
        <Bold className="w-5 h-5" />
      </button>

      <button
        onClick={() => editor.chain().focus().toggleItalic().run()}
        disabled={!editor.can().chain().focus().toggleItalic().run()}
        className={`p-1 rounded hover:bg-gray-100 ${
          editor.isActive("italic") ? "bg-gray-200" : ""
        }`}
        title="Italic"
        type="button"
      >
        <Italic className="w-5 h-5" />
      </button>

      <div className="w-px h-6 bg-gray-200 mx-1"></div>

      {showHeadings && (
        <>
          <button
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            className={`p-1 rounded hover:bg-gray-100 ${
              editor.isActive("heading", { level: 1 }) ? "bg-gray-200" : ""
            }`}
            title="Heading 1"
            type="button"
          >
            <Heading1 className="w-5 h-5" />
          </button>

          <button
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            className={`p-1 rounded hover:bg-gray-100 ${
              editor.isActive("heading", { level: 2 }) ? "bg-gray-200" : ""
            }`}
            title="Heading 2"
            type="button"
          >
            <Heading2 className="w-5 h-5" />
          </button>

          <button
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 3 }).run()
            }
            className={`p-1 rounded hover:bg-gray-100 ${
              editor.isActive("heading", { level: 3 }) ? "bg-gray-200" : ""
            }`}
            title="Heading 3"
            type="button"
          >
            <Heading3 className="w-5 h-5" />
          </button>

          <div className="w-px h-6 bg-gray-200 mx-1"></div>
        </>
      )}

      <button
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`p-1 rounded hover:bg-gray-100 ${
          editor.isActive("bulletList") ? "bg-gray-200" : ""
        }`}
        title="Bullet List"
        type="button"
      >
        <List className="w-5 h-5" />
      </button>

      <button
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={`p-1 rounded hover:bg-gray-100 ${
          editor.isActive("orderedList") ? "bg-gray-200" : ""
        }`}
        title="Ordered List"
        type="button"
      >
        <ListOrdered className="w-5 h-5" />
      </button>

      <div className="w-px h-6 bg-gray-200 mx-1"></div>

      <div className="relative">
        <button
          onClick={openLinkInput}
          className={`p-1 rounded hover:bg-gray-100 ${
            editor.isActive("link") || showLinkInput ? "bg-gray-200" : ""
          }`}
          title="Add Link"
          type="button"
        >
          <Link2 className="w-5 h-5" />
        </button>

        {showLinkInput && (
          <div className="absolute top-full left-0 mt-3 p-2 bg-white shadow-lg rounded-md z-10 border border-gray-200 flex items-center gap-2 w-[280px]">
            <input
              type="url"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  applyLink();
                }
              }}
              placeholder="https://example.com"
              autoFocus
              className="flex-1 h-8 px-2 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-gray-300"
            />
            <button
              onClick={applyLink}
              className="h-8 px-2 text-sm rounded-md bg-gray-900 text-white hover:bg-gray-700"
              type="button"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      <button
        onClick={() =>
          editor.chain().focus().extendMarkRange("link").unsetLink().run()
        }
        disabled={!editor.isActive("link")}
        className="p-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent"
        title="Remove Link"
        type="button"
      >
        <Link2Off className="w-5 h-5" />
      </button>

      <div className="w-px h-6 bg-gray-200 mx-1"></div>

      <div className="relative">
        <button
          onClick={() => setShowColorPicker(!showColorPicker)}
          className={`p-1 rounded hover:bg-gray-100 ${
            showColorPicker ? "bg-gray-200" : ""
          }`}
          title="Text Color"
          type="button"
        >
          <Palette className="w-5 h-5" />
        </button>

        {showColorPicker && (
          <div className="absolute top-full left-0 mt-3 p-2 pr-5 bg-white shadow-lg rounded-md z-10 border border-gray-200 grid grid-cols-6 gap-1 w-[100px]">
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => {
                  editor.chain().focus().setColor(color).run();
                  setShowColorPicker(false);
                }}
                className="w-5 h-5 rounded-full border border-gray-200"
                style={{ backgroundColor: color }}
                title={color}
                type="button"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default function TiptapEditor({
  content,
  onChange,
  className = "",
  placeholder = "",
  showHeadings = true,
}: TiptapEditorProps) {
  const [mounted, setMounted] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure(showHeadings ? {} : { heading: false }),
      ...(showHeadings
        ? [
            Heading.configure({
              levels: [1, 2, 3],
            }),
          ]
        : []),
      TextStyle,
      Color,
      ListItem,
      BulletList,
      OrderedList,
      LinkExtension.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    ],
    content: content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Handle content updates from parent
  useEffect(() => {
    if (editor && editor.getHTML() !== content) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!mounted) {
    return <div className="h-64 border rounded-md bg-gray-50"></div>;
  }

  return (
    <div className={`tiptap-editor ${className}`}>
      <MenuBar editor={editor} showHeadings={showHeadings} />
      <EditorContent
        placeholder={placeholder}
        editor={editor}
        className="prose prose-sm max-w-none border border-gray-200 rounded-b-md p-4 min-h-[200px] focus:outline-none"
      />
    </div>
  );
}
