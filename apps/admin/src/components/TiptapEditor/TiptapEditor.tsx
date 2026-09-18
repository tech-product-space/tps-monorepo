"use client";

import {
  useEditor,
  useEditorState,
  EditorContent,
  NodeViewWrapper,
  NodeViewProps,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Highlight from "@tiptap/extension-highlight";
import Link from "@tiptap/extension-link";
import TextAlign from "@tiptap/extension-text-align";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import ImageExtension from "@tiptap/extension-image";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";

import { useState, useCallback, useRef, useEffect } from "react";
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Underline as UnderlineIcon,
  Highlighter,
  Link as LinkIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Superscript as SuperscriptIcon,
  Subscript as SubscriptIcon,
  List,
  ListOrdered,
  TextQuote,
  Table as TableIcon,
  Trash2,
  PlusSquare,
  MinusSquare,
  Columns,
  Rows,
  Merge,
  Split,
  Image as ImageIcon,
  Youtube as YoutubeIcon,
  Video as VideoIcon,
  X,
  Minus,
  Palette,
  Code2,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import "./TiptapEditor.css";
import { uploadBlogFile } from "@/services/blog/blogService";
import { buildTocFromDoc, TocItem } from "./tocUtils";
import { CustomVideo, CustomYoutube } from "./mediaNodes";
import { HighlightedCodeBlock } from "./CodeBlockNode";
import {
  C_RULES,
  CPP_RULES,
  JAVA_RULES,
  JS_RULES,
  PYTHON_RULES,
} from "./LanguageRules";

// ─── Types ────────────────────────────────────────────────────────────────────
export type { TocItem };

interface TiptapEditorProps {
  onChange?: (data: { content: object; tableOfContents: TocItem[] }) => void;
  initialContent?: object;
  /**
   * "answer" mode drives HTML in/out instead of the blog JSON doc, and hides
   * the advanced media/tabbed-code blocks that require a matching renderer.
   * Used by the interview-question answer editor. Defaults to "blog".
   */
  variant?: "blog" | "answer";
  /** Initial HTML string (used when variant === "answer"). */
  initialHtml?: string;
  /** Called with the serialized HTML on every update (used in "answer" mode). */
  onChangeHtml?: (html: string) => void;
  /**
   * Where images dropped into the editor go, resolving to the URL to render.
   *
   * Each feature owns its own S3 folder — blogs upload to the blog path, a
   * lesson to its course's — so the caller supplies the uploader rather than
   * this component picking one. Defaults to the blog uploader, which is what
   * every caller wanted before lessons existed.
   */
  uploadImage?: (file: File) => Promise<string>;
  /**
   * The document as the editor read it, once, at load.
   *
   * Tiptap normalises stored JSON when it parses it — filling in attribute
   * defaults it wrote itself, dropping anything the schema no longer allows —
   * so what comes back out is not always byte-identical to what went in. A
   * caller comparing "current" against the *stored* JSON therefore sees an edit
   * on a document nobody has touched. This hands back the normalised form to
   * compare against instead.
   */
  onReady?: (doc: object) => void;
}

/** The historical behaviour: everything lands in the blog folder. */
const uploadToBlog = async (file: File): Promise<string> => {
  const res = await uploadBlogFile(file);
  return res.fileUrl;
};

// ─── Available languages for tabbed code block ────────────────────────────────
const CODE_LANGUAGES = ["Python", "JavaScript", "Java", "C++", "C"];

// ─── Width presets ────────────────────────────────────────────────────────────
const WIDTH_PRESETS = [
  { label: "25%", value: "25%" },
  { label: "50%", value: "50%" },
  { label: "75%", value: "75%" },
  { label: "100%", value: "100%" },
];

// ─── Font color preset swatches ───────────────────────────────────────────────
const COLOR_SWATCHES = [
  "#000000",
  "#374151",
  "#3e3e3e",
  "#6b7280",
  "#9ca3af",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#3b82f6",
  "#ec4899",
  "#14b8a6",
  "#1d4ed8",
  "#7c3aed",
  "#be185d",
  "#0f766e",
];

// ─── Syntax Highlighter ───────────────────────────────────────────────────────

type TokenType =
  | "keyword"
  | "string"
  | "number"
  | "comment"
  | "function"
  | "operator"
  | "builtin"
  | "type"
  | "tag"
  | "attr"
  | "plain";

interface Token {
  type: TokenType;
  value: string;
}

const TOKEN_COLORS: Record<TokenType, string> = {
  keyword: "#7c3aed",
  string: "#16a34a",
  number: "#ea580c",
  comment: "#94a3b8",
  function: "#2563eb",
  operator: "#0f766e",
  builtin: "#be185d",
  type: "#0369a1",
  tag: "#dc2626",
  attr: "#d97706",
  plain: "#1e293b",
};

const ESC = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function colSpan(t: Token): string {
  return `<span style="color:${TOKEN_COLORS[t.type]}">${ESC(t.value)}</span>`;
}

export type Rule = { type: TokenType; re: RegExp };

function tokenise(code: string, rules: Rule[]): Token[] {
  const tokens: Token[] = [];
  let rest = code;
  outer: while (rest.length) {
    for (const rule of rules) {
      const m = rest.match(rule.re);
      if (m && m.index === 0) {
        tokens.push({ type: rule.type, value: m[0] });
        rest = rest.slice(m[0].length);
        continue outer;
      }
    }
    tokens.push({ type: "plain", value: rest[0] });
    rest = rest.slice(1);
  }
  return tokens;
}

const RULES_MAP: Record<string, Rule[]> = {
  Python: PYTHON_RULES,
  JavaScript: JS_RULES,
  Java: JAVA_RULES,
  "C++": CPP_RULES,
  C: C_RULES,
};

function highlight(code: string, lang: string): string {
  const rules = RULES_MAP[lang];
  if (!rules) return ESC(code);
  return tokenise(code, rules).map(colSpan).join("");
}

// ─── Custom Tabbed Code Block Node ────────────────────────────────────────────

const CODE_EDITOR_STYLE: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  padding: "18px 22px",
  fontFamily: '"Fira Code", "Menlo", "Consolas", monospace',
  fontSize: "13.5px",
  lineHeight: 1.75,
  border: "none",
  outline: "none",
  resize: "none",
  background: "transparent",
  boxSizing: "border-box",
  whiteSpace: "pre",
  overflowWrap: "normal",
  overflow: "auto",
  tabSize: 2,
};

function TabbedCodeNodeView({ node, updateAttributes }: NodeViewProps) {
  const { languages, activeLanguage, codes } = node.attrs as {
    languages: string[];
    activeLanguage: string;
    codes: Record<string, string>;
  };

  const currentCode = codes?.[activeLanguage] ?? "";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localCode, setLocalCode] = useState(currentCode);

  useEffect(() => {
    setLocalCode(codes?.[activeLanguage] ?? "");
  }, [activeLanguage, codes]);

  const lines = Math.max(localCode.split("\n").length, 5);
  const editorHeight = lines * 13.5 * 1.75 + 36;

  const handleTabClick = (lang: string) => {
    updateAttributes({ activeLanguage: lang });
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setLocalCode(val);
    updateAttributes({ codes: { ...codes, [activeLanguage]: val } });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const next =
        localCode.substring(0, start) + "  " + localCode.substring(end);
      setLocalCode(next);
      updateAttributes({ codes: { ...codes, [activeLanguage]: next } });
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = start + 2;
      });
    }
  };

  const highlighted = highlight(localCode, activeLanguage);

  return (
    <NodeViewWrapper
      className="tiptap-code-block"
      data-drag-handle
      contentEditable={false}
    >
      <div className="tiptap-code-tabs">
        {languages.map((lang: string) => (
          <button
            key={lang}
            className={cn(
              "tiptap-code-tab",
              activeLanguage === lang && "active",
            )}
            onMouseDown={(e) => {
              e.preventDefault();
              handleTabClick(lang);
            }}
          >
            {lang}
          </button>
        ))}
      </div>

      <div className="tiptap-code-body">
        <div
          style={{ position: "relative", height: editorHeight, minHeight: 120 }}
        >
          <pre
            aria-hidden="true"
            style={{
              ...CODE_EDITOR_STYLE,
              color: TOKEN_COLORS.plain,
              pointerEvents: "none",
              userSelect: "none",
              overflow: "hidden",
            }}
            dangerouslySetInnerHTML={{
              __html:
                highlighted ||
                `<span style="color:#94a3b8">Write ${activeLanguage} code here…</span>`,
            }}
          />
          <textarea
            ref={textareaRef}
            value={localCode}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            style={{
              ...CODE_EDITOR_STYLE,
              color: "transparent",
              caretColor: TOKEN_COLORS.plain,
            }}
          />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const TabbedCodeBlock = Node.create({
  name: "tabbedCodeBlock",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      languages: {
        default: ["Python", "JavaScript", "Java", "C++", "C"],
      },
      activeLanguage: {
        default: "Python",
      },
      codes: {
        default: {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="tabbed-code-block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "tabbed-code-block" }),
      0,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TabbedCodeNodeView);
  },
});

// ─── Custom Image Node View ───────────────────────────────────────────────────
function ImageNodeView({ node, updateAttributes, selected }: NodeViewProps) {
  const { src, alt, width } = node.attrs as {
    src: string;
    alt?: string;
    width?: string;
  };

  return (
    <NodeViewWrapper className="tiptap-image-wrapper" data-drag-handle>
      <div
        style={{
          position: "relative",
          display: "inline-block",
          width: width ?? "100%",
        }}
      >
        {selected && (
          <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[#1e1e2e] border border-[#3b3b52] rounded-md px-1.5 py-1 z-100 shadow-lg whitespace-nowrap">
            {WIDTH_PRESETS.map((preset) => (
              <button
                key={preset.value}
                className={cn(
                  "text-[11px] font-medium px-2 py-0.5 rounded border transition-colors",
                  width === preset.value
                    ? "bg-blue-500 text-white border-blue-600"
                    : "bg-transparent text-[#a0a0b8] border-transparent hover:bg-[#2e2e44] hover:text-[#e0e0f0]",
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  updateAttributes({ width: preset.value });
                }}
              >
                {preset.label}
              </button>
            ))}
            <input
              className="text-[11px] px-1.5 py-0.5 rounded border border-[#3b3b52] bg-[#2e2e44] text-[#e0e0f0] w-18 outline-none focus:border-blue-500 placeholder:text-[#666]"
              type="text"
              placeholder="e.g. 320px"
              defaultValue={
                WIDTH_PRESETS.some((p) => p.value === width)
                  ? ""
                  : (width ?? "")
              }
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === "Enter")
                  updateAttributes({
                    width: (e.target as HTMLInputElement).value,
                  });
              }}
            />
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt ?? ""}
          style={{ width: "100%", display: "block" }}
          className={cn("tiptap-image", selected && "tiptap-image-selected")}
        />
      </div>
    </NodeViewWrapper>
  );
}

// ─── Extended Image Extension ─────────────────────────────────────────────────
const CustomImage = ImageExtension.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      width: {
        default: "100%",
        parseHTML: (element) =>
          element.style.width || element.getAttribute("width") || "100%",
        renderHTML: (attributes) => ({ style: `width: ${attributes.width}` }),
      },
    };
  },
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});

// ─── Toolbar Button ───────────────────────────────────────────────────────────
function ToolbarBtn({
  active,
  onClick,
  title,
  children,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          onMouseDown={(e) => {
            e.preventDefault();
            onClick();
          }}
          className={cn(
            "h-7 w-7 rounded-md text-slate-600 hover:bg-slate-200 hover:text-slate-900",
            active &&
              "bg-blue-100 text-blue-700 hover:bg-blue-100 hover:text-blue-700",
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {title}
      </TooltipContent>
    </Tooltip>
  );
}

const ICON_SIZE = 15;

// ─── Font Color Picker ────────────────────────────────────────────────────────
function FontColorPicker({
  currentColor,
  onSelect,
  onClose,
}: {
  currentColor: string;
  onSelect: (color: string) => void;
  onClose: () => void;
}) {
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target as globalThis.Node)
      )
        onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div
      ref={pickerRef}
      className="absolute top-[calc(100%+6px)] left-0 bg-white border border-slate-200 rounded-lg p-3 shadow-xl z-[100] w-[164px]"
    >
      <div className="text-[11px] text-slate-500 mb-2 font-medium">
        Font Color
      </div>
      <div className="grid grid-cols-4 gap-1.5 mb-2.5">
        {COLOR_SWATCHES.map((color) => (
          <button
            key={color}
            title={color}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(color);
            }}
            className={cn(
              "w-8 h-8 rounded-md border-2 transition-transform hover:scale-110",
              currentColor === color ? "border-blue-500" : "border-slate-200",
            )}
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
      <div className="flex items-center gap-1.5">
        <div
          className="w-6 h-6 rounded border border-slate-200 flex-shrink-0"
          style={{ backgroundColor: currentColor }}
        />
        <input
          type="text"
          className="flex-1 text-[11px] border border-slate-200 rounded px-1.5 py-1 outline-none focus:border-blue-400 font-mono w-[10px]"
          defaultValue={currentColor}
          placeholder="#000000"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const val = (e.target as HTMLInputElement).value;
              if (/^#[0-9a-fA-F]{3,6}$/.test(val)) onSelect(val);
            }
          }}
        />
      </div>
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          onSelect("");
        }}
        className="mt-2 w-full text-[11px] text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-400 rounded px-2 py-1 transition-colors"
      >
        Remove color
      </button>
    </div>
  );
}

// ─── Tabbed Code Insert Modal ─────────────────────────────────────────────────
function TabbedCodeModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (languages: string[]) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(["Python", "JavaScript"]);

  const toggle = (lang: string) => {
    setSelected((prev) =>
      prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang],
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black/35 flex items-center justify-center z-[1000]"
      onMouseDown={onClose}
    >
      <div
        className="bg-white rounded-xl p-5 w-[380px] max-w-[calc(100vw-32px)] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-4">
          <Code2 size={16} className="text-green-500" />
          <span>Insert Tabbed Code Block</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-6 w-6 text-slate-400 hover:text-slate-600"
            onClick={onClose}
          >
            <X size={14} />
          </Button>
        </div>

        <p className="text-xs text-slate-500 mb-3">
          Select the language tabs to include:
        </p>

        <div className="flex flex-wrap gap-2 mb-5">
          {CODE_LANGUAGES.map((lang) => (
            <button
              key={lang}
              onClick={() => toggle(lang)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                selected.includes(lang)
                  ? "bg-green-50 border-green-400 text-green-700"
                  : "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-400",
              )}
            >
              {lang}
            </button>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="rounded-sm"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => selected.length > 0 && onConfirm(selected)}
            disabled={selected.length === 0}
            className="rounded-sm bg-green-600 hover:bg-green-700 text-white"
          >
            Insert
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Table Picker ─────────────────────────────────────────────────────────────
function TablePicker({
  onSelect,
}: {
  onSelect: (rows: number, cols: number) => void;
}) {
  const [hovered, setHovered] = useState<{ r: number; c: number } | null>(null);
  const MAX = 8;

  return (
    <div className="absolute top-[calc(100%+6px)] left-0 bg-white border border-slate-200 rounded-lg p-2.5 shadow-xl z-[100]">
      <div className="text-[11px] text-slate-500 mb-1.5 text-center min-w-[80px]">
        {hovered ? `${hovered.r} × ${hovered.c}` : "Insert table"}
      </div>
      <div
        className="grid gap-0.5"
        style={{ gridTemplateColumns: `repeat(${MAX}, 18px)` }}
      >
        {Array.from({ length: MAX }, (_, r) =>
          Array.from({ length: MAX }, (_, c) => {
            const isActive = hovered && r < hovered.r && c < hovered.c;
            return (
              <div
                key={`${r}-${c}`}
                className={cn(
                  "w-[18px] h-[18px] border rounded-sm cursor-pointer transition-colors",
                  isActive
                    ? "bg-blue-100 border-blue-400"
                    : "bg-slate-50 border-slate-200",
                )}
                onMouseEnter={() => setHovered({ r: r + 1, c: c + 1 })}
                onMouseLeave={() => setHovered(null)}
                onClick={() => hovered && onSelect(hovered.r, hovered.c)}
              />
            );
          }),
        )}
      </div>
    </div>
  );
}

// ─── Loop / Autoplay checkbox row (shared by the media modals) ────────────────
function PlaybackOptions({
  loop,
  autoplay,
  muted,
  setLoop,
  setAutoplay,
  setMuted,
}: {
  loop: boolean;
  autoplay: boolean;
  muted: boolean;
  setLoop: (v: boolean) => void;
  setAutoplay: (v: boolean) => void;
  setMuted: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3">
      <label className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          checked={loop}
          onChange={(e) => setLoop(e.target.checked)}
        />
        Loop
      </label>
      <label className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          checked={autoplay}
          onChange={(e) => setAutoplay(e.target.checked)}
        />
        Autoplay (plays when scrolled into view)
      </label>
      <label className="flex items-center gap-2 text-[13px] text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          checked={muted}
          onChange={(e) => setMuted(e.target.checked)}
        />
        Mute
      </label>
    </div>
  );
}

// ─── YouTube URL Modal ────────────────────────────────────────────────────────
function YoutubeModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (
    url: string,
    loop: boolean,
    autoplay: boolean,
    muted: boolean,
  ) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");
  const [loop, setLoop] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [muted, setMuted] = useState(false);

  return (
    <div
      className="fixed inset-0 bg-black/35 flex items-center justify-center z-[1000]"
      onMouseDown={onClose}
    >
      <div
        className="bg-white rounded-xl p-5 w-[440px] max-w-[calc(100vw-32px)] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-3.5">
          <YoutubeIcon size={16} className="text-red-500" />
          <span>Embed YouTube video</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-6 w-6 text-slate-400 hover:text-slate-600"
            onClick={onClose}
          >
            <X size={14} />
          </Button>
        </div>
        <Input
          type="url"
          placeholder="https://www.youtube.com/watch?v=..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && url) onConfirm(url, loop, autoplay, muted);
            if (e.key === "Escape") onClose();
          }}
          autoFocus
          className="text-[13px]"
        />
        <PlaybackOptions
          loop={loop}
          autoplay={autoplay}
          muted={muted}
          setLoop={setLoop}
          setAutoplay={setAutoplay}
          setMuted={setMuted}
        />
        <div className="flex justify-end gap-2 mt-3.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="rounded-sm"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => url && onConfirm(url, loop, autoplay, muted)}
            disabled={!url}
            className="rounded-sm"
          >
            Embed
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Video Modal (mp4 / hosted URL) ───────────────────────────────────────────
function VideoModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (
    src: string,
    poster: string,
    loop: boolean,
    autoplay: boolean,
    muted: boolean,
  ) => void;
  onClose: () => void;
}) {
  const [src, setSrc] = useState("");
  const [poster, setPoster] = useState("");
  const [loop, setLoop] = useState(false);
  const [autoplay, setAutoplay] = useState(false);
  const [muted, setMuted] = useState(false);

  return (
    <div
      className="fixed inset-0 bg-black/35 flex items-center justify-center z-[1000]"
      onMouseDown={onClose}
    >
      <div
        className="bg-white rounded-xl p-5 w-[460px] max-w-[calc(100vw-32px)] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 mb-3.5">
          <VideoIcon size={16} className="text-blue-500" />
          <span>Insert video</span>
          <Button
            variant="ghost"
            size="icon"
            className="ml-auto h-6 w-6 text-slate-400 hover:text-slate-600"
            onClick={onClose}
          >
            <X size={14} />
          </Button>
        </div>
        <label className="text-[12px] text-slate-500">Video URL (mp4 / hosted)</label>
        <Input
          type="url"
          placeholder="https://.../video.mp4"
          value={src}
          onChange={(e) => setSrc(e.target.value)}
          autoFocus
          className="text-[13px] mt-1"
        />
        <label className="text-[12px] text-slate-500 mt-3 block">
          Poster / thumbnail URL (optional)
        </label>
        <Input
          type="url"
          placeholder="https://.../poster.jpg"
          value={poster}
          onChange={(e) => setPoster(e.target.value)}
          className="text-[13px] mt-1"
        />
        <PlaybackOptions
          loop={loop}
          autoplay={autoplay}
          muted={muted}
          setLoop={setLoop}
          setAutoplay={setAutoplay}
          setMuted={setMuted}
        />
        <div className="flex justify-end gap-2 mt-3.5">
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            className="rounded-sm"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => src && onConfirm(src, poster, loop, autoplay, muted)}
            disabled={!src}
            className="rounded-sm"
          >
            Insert
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Active block label (shown next to heading select) ────────────────────────
const BLOCK_LABELS: Record<string, string> = {
  h1: "H1",
  h2: "H2",
  h3: "H3",
  p: "P",
};

/**
 * The document schema, in one place.
 *
 * Every reader of a stored document has to parse it against this exact list —
 * the editor, the read-only preview, and the .docx importer that writes JSON for
 * it. A node configured in one list and missing from another is not an error;
 * it is silently dropped the next time the document is opened. A factory rather
 * than a shared array so two editors on one page never share extension state.
 */
export const createEditorExtensions = () => [
  StarterKit.configure({
    codeBlock: false,
    heading: { levels: [1, 2, 3], HTMLAttributes: {} },
    bold: { HTMLAttributes: { class: "tiptap-bold" } },
  }),
  Underline,
  Highlight.configure({ multicolor: false }),
  Link.configure({ openOnClick: false }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  Superscript,
  Subscript,
  HighlightedCodeBlock,
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  CustomImage.configure({
    inline: false,
    allowBase64: false,
    HTMLAttributes: { class: "tiptap-image" },
  }),
  CustomVideo,
  CustomYoutube,
  TextStyle,
  Color,
  TabbedCodeBlock,
];

// ─── Main Editor ──────────────────────────────────────────────────────────────
export default function TiptapEditor({
  onChange,
  initialContent,
  variant = "blog",
  initialHtml,
  onChangeHtml,
  uploadImage = uploadToBlog,
  onReady,
}: TiptapEditorProps) {
  const isAnswer = variant === "answer";
  const [linkUrl, setLinkUrl] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showYoutubeModal, setShowYoutubeModal] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);

  const tablePickerRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        tablePickerRef.current &&
        !tablePickerRef.current.contains(e.target as unknown as globalThis.Node)
      ) {
        setShowTablePicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: createEditorExtensions(),
    content: isAnswer ? (initialHtml ?? "") : initialContent,
    editorProps: { attributes: { class: "tiptap-content" } },
    onCreate({ editor }) {
      if (!isAnswer) onReady?.(editor.getJSON());
    },
    onUpdate({ editor }) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (isAnswer) {
          onChangeHtml?.(editor.getHTML());
          return;
        }
        if (!onChange) return;
        const json = editor.getJSON();
        onChange({
          content: json,
          tableOfContents: buildTocFromDoc(json),
        });
      }, 600);
    },
  });

  // ── Reactive editor state — updates on every cursor/selection move ──────────
  const editorState = useEditorState({
    editor,
    selector: (ctx) => {
      const e = ctx.editor;
      if (!e) {
        return {
          activeBlockType: "p",
          headingLevel: undefined as 1 | 2 | 3 | undefined,
          inTable: false,
        };
      }
      const activeBlockType = e.isActive("heading", { level: 1 })
        ? "h1"
        : e.isActive("heading", { level: 2 })
          ? "h2"
          : e.isActive("heading", { level: 3 })
            ? "h3"
            : "p";
      const headingLevel = [1, 2, 3].find((l) =>
        e.isActive("heading", { level: l }),
      ) as 1 | 2 | 3 | undefined;
      const inTable = e.isActive("tableCell") || e.isActive("tableHeader");
      return { activeBlockType, headingLevel, inTable };
    },
  });
  const { activeBlockType, headingLevel, inTable } = editorState ?? {
    activeBlockType: "p",
    headingLevel: undefined as 1 | 2 | 3 | undefined,
    inTable: false,
  };

  const setLink = useCallback(() => {
    if (!linkUrl) {
      editor?.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      editor
        ?.chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: linkUrl })
        .run();
    }
    setShowLinkInput(false);
    setLinkUrl("");
  }, [editor, linkUrl]);

  const handleImageFile = useCallback(
    async (file: File) => {
      if (!editor) return;
      if (!file.type.startsWith("image/")) {
        alert("Please select an image file.");
        return;
      }
      try {
        const fileUrl = await uploadImage(file);
        editor.chain().focus().setImage({ src: fileUrl, alt: file.name }).run();
      } catch (err) {
        console.error("Image upload error:", err);
        alert(
          err instanceof Error
            ? err.message
            : "Image upload failed. Please try again.",
        );
      }
    },
    [editor, uploadImage],
  );

  const handleYoutubeEmbed = useCallback(
    (url: string, loop: boolean, autoplay: boolean, muted: boolean) => {
      if (!editor || !url) return;
      editor
        .chain()
        .focus()
        .insertContent({
          type: "youtube",
          attrs: { src: url, loop, autoplay, muted },
        })
        .run();
      setShowYoutubeModal(false);
    },
    [editor],
  );

  const handleInsertVideo = useCallback(
    (
      src: string,
      poster: string,
      loop: boolean,
      autoplay: boolean,
      muted: boolean,
    ) => {
      if (!editor || !src) return;
      editor
        .chain()
        .focus()
        .insertContent({
          type: "customVideo",
          attrs: { src, poster, loop, autoplay, muted, width: "100%" },
        })
        .run();
      setShowVideoModal(false);
    },
    [editor],
  );

  const handleColorSelect = useCallback(
    (color: string) => {
      if (!editor) return;
      if (color === "") {
        editor.chain().focus().unsetColor().run();
      } else {
        editor.chain().focus().setColor(color).run();
      }
      setShowColorPicker(false);
    },
    [editor],
  );

  const handleInsertTabbedCode = useCallback(
    (languages: string[]) => {
      if (!editor) return;
      editor
        .chain()
        .focus()
        .insertContent({
          type: "tabbedCodeBlock",
          attrs: {
            languages,
            activeLanguage: languages[0],
            codes: {},
          },
        })
        .run();
      setShowCodeModal(false);
    },
    [editor],
  );

  const currentColor = editor?.getAttributes("textStyle").color ?? "#000000";

  if (!editor) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tc = () => editor.chain().focus() as any;

  const insertTable = (rows: number, cols: number) => {
    tc().insertTable({ rows, cols, withHeaderRow: true }).run();
    setShowTablePicker(false);
  };

  return (
    <TooltipProvider delayDuration={400}>
      <div className="w-full max-w-[720px] mx-auto border border-slate-200 rounded-xl bg-white font-sans text-[15px] leading-[1.65] text-[#3e3e3e]">
        <div className="flex flex-col min-h-[500px]">
          {/* Sticky Toolbar */}
          <div className="sticky top-0 z-50 bg-slate-50 border-b border-slate-200 rounded-t-xl shadow-sm overflow-visible">
            <div className="flex flex-wrap items-center gap-0.5 px-2.5 py-1.5">
              {/* Undo / Redo */}
              <ToolbarBtn
                title="Undo (Ctrl+Z)"
                onClick={() => editor.chain().focus().undo().run()}
              >
                <Undo2 size={ICON_SIZE} />
              </ToolbarBtn>
              <ToolbarBtn
                title="Redo (Ctrl+Y)"
                onClick={() => editor.chain().focus().redo().run()}
              >
                <Redo2 size={ICON_SIZE} />
              </ToolbarBtn>

              <Separator orientation="vertical" className="h-5 mx-0.5" />

              {/* Heading select + active block badge */}
              <div className="flex items-center gap-1">
                <Select
                  value={String(headingLevel ?? "p")}
                  onValueChange={(v) => {
                    if (v === "p") editor.chain().focus().setParagraph().run();
                    else
                      editor
                        .chain()
                        .focus()
                        .setHeading({ level: Number(v) as 1 | 2 | 3 })
                        .run();
                  }}
                >
                  <SelectTrigger className="h-7 w-[110px] text-xs border-slate-200 bg-transparent focus:ring-0 focus:ring-offset-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="p" className="text-xs">
                      Paragraph
                    </SelectItem>
                    <SelectItem value="1" className="text-xs">
                      Heading 1
                    </SelectItem>
                    <SelectItem value="2" className="text-xs">
                      Heading 2
                    </SelectItem>
                    <SelectItem value="3" className="text-xs">
                      Heading 3
                    </SelectItem>
                  </SelectContent>
                </Select>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "inline-flex items-center justify-center h-5 min-w-[22px] px-1 rounded text-[10px] font-bold tracking-wide select-none cursor-default border transition-colors",
                        activeBlockType === "p"
                          ? "bg-slate-100 text-slate-500 border-slate-200"
                          : "bg-blue-100 text-blue-700 border-blue-300",
                      )}
                    >
                      {BLOCK_LABELS[activeBlockType]}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">
                    Current block:{" "}
                    {activeBlockType === "p"
                      ? "Paragraph"
                      : `Heading ${activeBlockType.slice(1)}`}
                  </TooltipContent>
                </Tooltip>
              </div>

              <Separator orientation="vertical" className="h-5 mx-0.5" />

              {/* Lists & Quote */}
              <ToolbarBtn
                title="Bullet list"
                active={editor.isActive("bulletList")}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
              >
                <List size={ICON_SIZE} />
              </ToolbarBtn>
              <ToolbarBtn
                title="Ordered list"
                active={editor.isActive("orderedList")}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
              >
                <ListOrdered size={ICON_SIZE} />
              </ToolbarBtn>
              <ToolbarBtn
                title="Blockquote"
                active={editor.isActive("blockquote")}
                onClick={() => editor.chain().focus().toggleBlockquote().run()}
              >
                <TextQuote size={ICON_SIZE} />
              </ToolbarBtn>
              <ToolbarBtn
                title="Horizontal rule"
                onClick={() => editor.chain().focus().setHorizontalRule().run()}
              >
                <Minus size={ICON_SIZE} />
              </ToolbarBtn>

              <Separator orientation="vertical" className="h-5 mx-0.5" />

              {/* Inline formatting */}
              <ToolbarBtn
                title="Bold (Ctrl+B)"
                active={editor.isActive("bold")}
                onClick={() => editor.chain().focus().toggleBold().run()}
              >
                <Bold size={ICON_SIZE} />
              </ToolbarBtn>
              <ToolbarBtn
                title="Italic (Ctrl+I)"
                active={editor.isActive("italic")}
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                <Italic size={ICON_SIZE} />
              </ToolbarBtn>
              <ToolbarBtn
                title="Strikethrough"
                active={editor.isActive("strike")}
                onClick={() => editor.chain().focus().toggleStrike().run()}
              >
                <Strikethrough size={ICON_SIZE} />
              </ToolbarBtn>
              <ToolbarBtn
                title="Inline code"
                active={editor.isActive("code")}
                onClick={() => editor.chain().focus().toggleCode().run()}
              >
                <Code size={ICON_SIZE} />
              </ToolbarBtn>
              <ToolbarBtn
                title="Underline (Ctrl+U)"
                active={editor.isActive("underline")}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
              >
                <UnderlineIcon size={ICON_SIZE} />
              </ToolbarBtn>
              {/* Highlight + Font Color — blog mode only (answers are white-only) */}
              {!isAnswer && (
                <>
                  <ToolbarBtn
                    title="Highlight"
                    active={editor.isActive("highlight")}
                    onClick={() =>
                      editor.chain().focus().toggleHighlight().run()
                    }
                  >
                    <Highlighter size={ICON_SIZE} />
                  </ToolbarBtn>

                  {/* Font Color */}
                  <div className="relative" ref={colorPickerRef}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setShowColorPicker((prev) => !prev);
                          }}
                          className={cn(
                            "h-7 w-7 rounded-md text-slate-600 hover:bg-slate-200 hover:text-slate-900 relative",
                            showColorPicker && "bg-blue-100 text-blue-700",
                          )}
                        >
                          <div className="flex flex-col items-center gap-px">
                            <Palette size={13} />
                            <div
                              className="w-3.5 h-[3px] rounded-full"
                              style={{
                                backgroundColor:
                                  currentColor && currentColor !== "#000000"
                                    ? currentColor
                                    : "#3b82f6",
                              }}
                            />
                          </div>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        Font color
                      </TooltipContent>
                    </Tooltip>
                    {showColorPicker && (
                      <FontColorPicker
                        currentColor={currentColor}
                        onSelect={handleColorSelect}
                        onClose={() => setShowColorPicker(false)}
                      />
                    )}
                  </div>
                </>
              )}

              <ToolbarBtn
                title="Insert / edit link"
                active={editor.isActive("link")}
                onClick={() => setShowLinkInput(!showLinkInput)}
              >
                <LinkIcon size={ICON_SIZE} />
              </ToolbarBtn>
              <ToolbarBtn
                title="Superscript"
                active={editor.isActive("superscript")}
                onClick={() => tc().toggleSuperscript().run()}
              >
                <SuperscriptIcon size={ICON_SIZE} />
              </ToolbarBtn>
              <ToolbarBtn
                title="Subscript"
                active={editor.isActive("subscript")}
                onClick={() => tc().toggleSubscript().run()}
              >
                <SubscriptIcon size={ICON_SIZE} />
              </ToolbarBtn>

              <Separator orientation="vertical" className="h-5 mx-0.5" />

              {/* Alignment */}
              <ToolbarBtn
                title="Align left"
                active={editor.isActive({ textAlign: "left" })}
                onClick={() => editor.chain().focus().setTextAlign("left").run()}
              >
                <AlignLeft size={ICON_SIZE} />
              </ToolbarBtn>
              <ToolbarBtn
                title="Align center"
                active={editor.isActive({ textAlign: "center" })}
                onClick={() =>
                  editor.chain().focus().setTextAlign("center").run()
                }
              >
                <AlignCenter size={ICON_SIZE} />
              </ToolbarBtn>
              <ToolbarBtn
                title="Align right"
                active={editor.isActive({ textAlign: "right" })}
                onClick={() =>
                  editor.chain().focus().setTextAlign("right").run()
                }
              >
                <AlignRight size={ICON_SIZE} />
              </ToolbarBtn>
              <ToolbarBtn
                title="Justify"
                active={editor.isActive({ textAlign: "justify" })}
                onClick={() =>
                  editor.chain().focus().setTextAlign("justify").run()
                }
              >
                <AlignJustify size={ICON_SIZE} />
              </ToolbarBtn>

              <Separator orientation="vertical" className="h-5 mx-0.5" />

              {/* Image */}
              <ToolbarBtn
                title="Insert image"
                onClick={() => imageInputRef.current?.click()}
              >
                <ImageIcon size={ICON_SIZE} />
              </ToolbarBtn>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageFile(file);
                  e.target.value = "";
                }}
              />

              {/* Advanced media / tabbed code — blog mode only */}
              {!isAnswer && (
                <>
                  {/* Video (mp4 / hosted) */}
                  <ToolbarBtn
                    title="Insert video"
                    active={showVideoModal}
                    onClick={() => setShowVideoModal(true)}
                  >
                    <VideoIcon size={ICON_SIZE} />
                  </ToolbarBtn>

                  {/* YouTube */}
                  <ToolbarBtn
                    title="Embed YouTube video"
                    active={showYoutubeModal}
                    onClick={() => setShowYoutubeModal(true)}
                  >
                    <YoutubeIcon size={ICON_SIZE} />
                  </ToolbarBtn>

                  {/* Tabbed Code Block */}
                  <ToolbarBtn
                    title="Insert tabbed code block"
                    active={showCodeModal}
                    onClick={() => setShowCodeModal(true)}
                  >
                    <Code2 size={ICON_SIZE} />
                  </ToolbarBtn>
                </>
              )}

              <Separator orientation="vertical" className="h-5 mx-0.5" />

              {/* Table picker */}
              <div className="relative" ref={tablePickerRef}>
                <ToolbarBtn
                  title="Insert table"
                  active={showTablePicker}
                  onClick={() => setShowTablePicker(!showTablePicker)}
                >
                  <TableIcon size={ICON_SIZE} />
                </ToolbarBtn>
                {showTablePicker && <TablePicker onSelect={insertTable} />}
              </div>

              {/* In-table controls */}
              {inTable && (
                <>
                  <Separator orientation="vertical" className="h-5 mx-0.5" />
                  <ToolbarBtn
                    title="Add column before"
                    onClick={() => tc().addColumnBefore().run()}
                  >
                    <Columns size={ICON_SIZE} />
                  </ToolbarBtn>
                  <ToolbarBtn
                    title="Add column after"
                    onClick={() => tc().addColumnAfter().run()}
                  >
                    <PlusSquare size={ICON_SIZE} />
                  </ToolbarBtn>
                  <ToolbarBtn
                    title="Delete column"
                    onClick={() => tc().deleteColumn().run()}
                  >
                    <MinusSquare size={ICON_SIZE} />
                  </ToolbarBtn>
                  <Separator orientation="vertical" className="h-5 mx-0.5" />
                  <ToolbarBtn
                    title="Add row before"
                    onClick={() => tc().addRowBefore().run()}
                  >
                    <Rows size={ICON_SIZE} />
                  </ToolbarBtn>
                  <ToolbarBtn
                    title="Add row after"
                    onClick={() => tc().addRowAfter().run()}
                  >
                    <PlusSquare size={ICON_SIZE} />
                  </ToolbarBtn>
                  <ToolbarBtn
                    title="Delete row"
                    onClick={() => tc().deleteRow().run()}
                  >
                    <MinusSquare size={ICON_SIZE} />
                  </ToolbarBtn>
                  <Separator orientation="vertical" className="h-5 mx-0.5" />
                  <ToolbarBtn
                    title="Merge cells"
                    onClick={() => tc().mergeCells().run()}
                  >
                    <Merge size={ICON_SIZE} />
                  </ToolbarBtn>
                  <ToolbarBtn
                    title="Split cell"
                    onClick={() => tc().splitCell().run()}
                  >
                    <Split size={ICON_SIZE} />
                  </ToolbarBtn>
                  <Separator orientation="vertical" className="h-5 mx-0.5" />
                  <ToolbarBtn
                    title="Delete table"
                    onClick={() => tc().deleteTable().run()}
                  >
                    <Trash2 size={ICON_SIZE} />
                  </ToolbarBtn>
                </>
              )}
            </div>

            {/* Link input row */}
            {showLinkInput && (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-sky-50 border-t border-sky-200">
                <Input
                  type="url"
                  placeholder="https://example.com"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setLink()}
                  autoFocus
                  className="flex-1 h-8 text-[13px] bg-white border-slate-300"
                />
                <Button size="sm" className="h-8 text-xs" onClick={setLink}>
                  Apply
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => setShowLinkInput(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
          {/* End sticky toolbar */}

          {/* Editor area */}
          <div className="flex-1 px-10 py-7 min-h-[400px] box-border max-sm:px-4 max-sm:py-[18px]">
            <EditorContent editor={editor} />
          </div>
        </div>

        {showYoutubeModal && (
          <YoutubeModal
            onConfirm={handleYoutubeEmbed}
            onClose={() => setShowYoutubeModal(false)}
          />
        )}

        {showVideoModal && (
          <VideoModal
            onConfirm={handleInsertVideo}
            onClose={() => setShowVideoModal(false)}
          />
        )}

        {showCodeModal && (
          <TabbedCodeModal
            onConfirm={handleInsertTabbedCode}
            onClose={() => setShowCodeModal(false)}
          />
        )}
      </div>
    </TooltipProvider>
  );
}
