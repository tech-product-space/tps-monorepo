"use client";

import {
  useEditor,
  useEditorState,
  EditorContent,
  NodeViewWrapper,
  NodeViewProps,
  ReactNodeViewRenderer,
  Node,
} from "@tiptap/react";
import { mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { CustomImageBase, TabbedCodeBlockBase } from "./nodes";
import Youtube from "@tiptap/extension-youtube";
import TableOfContents from "@tiptap/extension-table-of-contents";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useImperativeHandle,
} from "react";
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
  X,
  Minus,
  Palette,
  Code2,
  Plus,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/gradient/components/ui/tooltip";
import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
import { Separator } from "@/gradient/components/ui/separator";
import { cn } from "@/gradient/lib/utils";
import "./TiptapEditor.css";
import { uploadFile } from "@/gradient/services/fileUpload";
import { resolveStorageUrl } from "@/gradient/lib/storage";
import {
  CODE_LANGUAGE_IDS,
  languageLabel,
  normaliseLanguage,
} from "@/gradient/lib/code/languages";
import { tokenColor } from "@/gradient/lib/code/highlighter";
import {
  CopyCodeButton,
  HighlightedCodeBlock,
  useCodeTokens,
} from "./CodeBlockNode";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface TocItem {
  id: string;
  level: number;
  textContent: string;
}

/** Imperative access for callers that need to drive the document. */
export interface TiptapEditorHandle {
  /**
   * Replaces the whole document, e.g. with the result of a .docx import.
   * Emits an update, so `onChange` fires with a freshly built table of
   * contents and the caller's dirty state stays honest. Undoable.
   */
  replaceContent: (content: object) => void;
}

export interface TiptapEditorProps {
  uploadId?: string;
  uploadType?: "blog" | "event" | "resource" | "free-course" | "project";
  blogId?: string; // Deprecated: Use uploadId and uploadType instead
  onChange?: (data: { content: object; tableOfContents: TocItem[] }) => void;
  initialContent?: object;
  stickyOffset?: number;
  /** Receives the imperative handle above. */
  editorRef?: React.Ref<TiptapEditorHandle>;
}

// ─── Tabbed code block languages ──────────────────────────────────────────────
//
// The same fourteen the single-language block offers — there was no reason for
// the multi-language one to know only five.
//
// New blocks store ids ("cpp"); blocks made before this stored display names
// ("C++"). Both keep working because an entry in `languages` is treated as an
// opaque key: `codes` is looked up by it verbatim, while the label and the
// grammar come from `normaliseLanguage(key)`. Nothing is rewritten on open.
const TABBED_CODE_LANGUAGES = CODE_LANGUAGE_IDS;

/** What a stored `languages` entry should be called on its tab. */
const tabLabel = (key: string) => languageLabel(normaliseLanguage(key));

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

// ─── Custom Tabbed Code Block Node ────────────────────────────────────────────

interface TabbedCodeNodeViewProps extends NodeViewProps {}

// The textarea is transparent and sits exactly on top of the highlighted <pre>,
// so both must share these metrics to the pixel — and they must match
// `.tiptap-code-pre` in TiptapEditor.css, or the caret drifts off the glyphs.
const CODE_FONT_SIZE = 13;
const CODE_LINE_HEIGHT = 1.7;

const CODE_EDITOR_STYLE: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  padding: "16px 18px",
  fontFamily:
    '"DM Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontSize: `${CODE_FONT_SIZE}px`,
  lineHeight: CODE_LINE_HEIGHT,
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

function TabbedCodeNodeView({
  node,
  updateAttributes,
}: TabbedCodeNodeViewProps) {
  const { languages, activeLanguage, codes } = node.attrs as {
    languages: string[];
    activeLanguage: string;
    codes: Record<string, string>;
  };

  const currentCode = codes?.[activeLanguage] ?? "";
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [localCode, setLocalCode] = useState(currentCode);
  /** Viewport coordinates for the add-language menu; null while closed. */
  const [menuAt, setMenuAt] = useState<{ top: number; left: number } | null>(
    null,
  );
  const addButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setLocalCode(codes?.[activeLanguage] ?? "");
  }, [activeLanguage, codes]);

  const lines = Math.max(localCode.split("\n").length, 5);
  const editorHeight = lines * CODE_FONT_SIZE * CODE_LINE_HEIGHT + 32;

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

  // The menu is placed once, from the button's position at open time, so a
  // scroll would leave it stranded mid-page. Close on both.
  useEffect(() => {
    if (!menuAt) return;

    const close = (e: Event) => {
      const target = e.target as globalThis.Node | null;
      if (
        e.type === "mousedown" &&
        target instanceof Element &&
        target.closest(".tiptap-code-add-menu, .tiptap-code-tab-add")
      ) {
        return;
      }
      setMenuAt(null);
    };

    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menuAt]);

  const tokens = useCodeTokens(localCode, normaliseLanguage(activeLanguage));

  // Languages not already on a tab. Compared by resolved id, so an old block
  // holding "C++" does not also offer "cpp".
  const present = new Set(languages.map((l) => normaliseLanguage(l)));
  const addableLanguages = CODE_LANGUAGE_IDS.filter((id) => !present.has(id));

  const toggleAddMenu = () => {
    if (menuAt) {
      setMenuAt(null);
      return;
    }
    const rect = addButtonRef.current?.getBoundingClientRect();
    if (rect) setMenuAt({ top: rect.bottom + 4, left: rect.left });
  };

  const handleAddLanguage = (id: string) => {
    setMenuAt(null);
    updateAttributes({
      languages: [...languages, id],
      activeLanguage: id,
    });
  };

  const handleRemoveLanguage = (lang: string) => {
    const remaining = languages.filter((l) => l !== lang);
    if (!remaining.length) return;
    updateAttributes({
      languages: remaining,
      // Removing the tab you were on has to land somewhere.
      activeLanguage: activeLanguage === lang ? remaining[0] : activeLanguage,
      // `codes` deliberately keeps the removed entry. Undo restores the tab
      // either way, but so does adding the language back — and silently
      // discarding code on one click is the worse way to be wrong.
      codes,
    });
  };

  return (
    <NodeViewWrapper
      className="tiptap-code-block"
      data-drag-handle
      contentEditable={false}
    >
      <div className="tiptap-code-header">
        <div className="tiptap-code-tabs">
          {languages.map((lang: string) => (
            <span
              key={lang}
              className={cn(
                "tiptap-code-tab",
                activeLanguage === lang && "active",
              )}
            >
              <button
                type="button"
                className="tiptap-code-tab-name"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleTabClick(lang);
                }}
              >
                {tabLabel(lang)}
              </button>
              {/* The last tab has no remove button: a tabbed block with no
                  tabs has nowhere to put its code. Delete the whole block
                  instead. */}
              {languages.length > 1 && (
                <button
                  type="button"
                  className="tiptap-code-tab-remove"
                  title={`Remove the ${tabLabel(lang)} tab`}
                  aria-label={`Remove the ${tabLabel(lang)} tab`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleRemoveLanguage(lang);
                  }}
                >
                  <X size={11} />
                </button>
              )}
            </span>
          ))}

          {addableLanguages.length > 0 && (
            <span className="tiptap-code-tab-adder">
              <button
                ref={addButtonRef}
                type="button"
                className="tiptap-code-tab-add"
                title="Add a language tab"
                aria-label="Add a language tab"
                onMouseDown={(e) => {
                  e.preventDefault();
                  toggleAddMenu();
                }}
              >
                <Plus size={12} />
              </button>
            </span>
          )}
        </div>
        <CopyCodeButton value={localCode} />
      </div>

      {/* Anchored to the viewport, not to the header. The block clips its own
          overflow so the corners stay rounded, and the tab strip scrolls
          horizontally — a menu positioned inside either one is invisible the
          moment it drops below the header. */}
      {menuAt && addableLanguages.length > 0 && (
        <div
          className="tiptap-code-add-menu"
          style={{ top: menuAt.top, left: menuAt.left }}
        >
          {addableLanguages.map((id) => (
            <button
              key={id}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                handleAddLanguage(id);
              }}
            >
              {languageLabel(id)}
            </button>
          ))}
        </div>
      )}

      <div className="tiptap-code-body">
        <div
          style={{ position: "relative", height: editorHeight, minHeight: 120 }}
        >
          {/* The visible layer. The textarea above it is transparent, so this
              is what the author actually reads while typing. */}
          <pre
            aria-hidden="true"
            style={{
              ...CODE_EDITOR_STYLE,
              color: tokenColor(null),
              pointerEvents: "none",
              userSelect: "none",
              overflow: "hidden",
            }}
          >
            {localCode ? (
              tokens.map((token, i) => (
                <span
                  key={i}
                  style={token.type ? { color: tokenColor(token.type) } : undefined}
                >
                  {token.text}
                </span>
              ))
            ) : (
              <span style={{ color: "#6b6b6b", fontStyle: "italic" }}>
                Write {activeLanguage} code here…
              </span>
            )}
          </pre>
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
              caretColor: tokenColor(null),
            }}
          />
        </div>
      </div>
    </NodeViewWrapper>
  );
}

export const TabbedCodeBlock = TabbedCodeBlockBase.extend({
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

  const displaySrc = src?.startsWith("http") ? src : resolveStorageUrl(src);

  return (
    <NodeViewWrapper className="tiptap-image-wrapper" data-drag-handle>
      <div
        style={{
          position: "relative",
          display: "inline-block",
          width: width ?? "100%",
          // Never wider than the column, whatever width was set. The <img>
          // inside is width:100% *of this div*, so without the cap a custom
          // width like "900px" makes the image's own max-width:100% resolve
          // against an already-oversized parent and the picture hangs out of
          // the editor.
          maxWidth: "100%",
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
        <img
          src={displaySrc}
          alt={alt ?? ""}
          style={{ width: "100%", display: "block" }}
          className={cn("tiptap-image", selected && "tiptap-image-selected")}
        />
      </div>
    </NodeViewWrapper>
  );
}

// ─── Extended Image Extension ─────────────────────────────────────────────────
export const CustomImage = CustomImageBase.extend({
  addNodeView() {
    return ReactNodeViewRenderer(ImageNodeView);
  },
});

// ─── Clipboard / drop image helper ────────────────────────────────────────────
function imageFilesFrom(list: FileList | null | undefined): File[] {
  if (!list || list.length === 0) return [];
  return Array.from(list).filter((file) => file.type.startsWith("image/"));
}

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
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node))
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
  const [selected, setSelected] = useState<string[]>(["python", "javascript"]);

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
          {TABBED_CODE_LANGUAGES.map((lang) => (
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
              {languageLabel(lang)}
            </button>
          ))}
        </div>

        <p className="text-[11px] text-slate-400 mb-4">
          You can add or remove tabs later from the block itself.
        </p>

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

// ─── YouTube URL Modal ────────────────────────────────────────────────────────
function YoutubeModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (url: string) => void;
  onClose: () => void;
}) {
  const [url, setUrl] = useState("");

  return (
    <div
      className="fixed inset-0 bg-black/35 flex items-center justify-center z-[1000]"
      onMouseDown={onClose}
    >
      <div
        className="bg-white rounded-xl p-5 w-[420px] max-w-[calc(100vw-32px)] shadow-2xl"
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
            if (e.key === "Enter" && url) onConfirm(url);
            if (e.key === "Escape") onClose();
          }}
          autoFocus
          className="text-[13px]"
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
            onClick={() => url && onConfirm(url)}
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

// ─── Active block label (shown next to heading select) ────────────────────────
const BLOCK_LABELS: Record<string, string> = {
  h1: "H1",
  h2: "H2",
  h3: "H3",
  p: "P",
};

// ─── Main Editor ──────────────────────────────────────────────────────────────
export default function TiptapEditor({
  uploadId,
  uploadType,
  blogId,
  onChange,
  initialContent,
  stickyOffset,
  editorRef,
}: TiptapEditorProps) {
  // Use uploadId/uploadType if provided, otherwise fallback to blogId
  const effectiveId = uploadId || blogId;
  const effectiveType = uploadType || "blog";

  const [linkUrl, setLinkUrl] = useState("");
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [showTablePicker, setShowTablePicker] = useState(false);
  const [showYoutubeModal, setShowYoutubeModal] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showCodeModal, setShowCodeModal] = useState(false);
  const [showCodeMenu, setShowCodeMenu] = useState(false);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);

  const tablePickerRef = useRef<HTMLDivElement>(null);
  const codeMenuRef = useRef<HTMLDivElement>(null);
  const colorPickerRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const tocRef = useRef<TocItem[]>([]);
  // editorProps is built before handleImageFile exists, so paste/drop go
  // through a ref that gets pointed at the real uploader below.
  const uploadImageRef = useRef<(file: File, pos?: number) => void>(() => {});
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    tocRef.current = tocItems;
  }, [tocItems]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        tablePickerRef.current &&
        !tablePickerRef.current.contains(e.target as unknown as globalThis.Node)
      ) {
        setShowTablePicker(false);
      }
      if (
        codeMenuRef.current &&
        !codeMenuRef.current.contains(e.target as unknown as globalThis.Node)
      ) {
        setShowCodeMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // StarterKit v3 already bundles link and underline; registering them
      // again warned about duplicate extension names and left it ambiguous
      // which config won. Configure them through StarterKit instead.
      StarterKit.configure({
        codeBlock: false,
        heading: { levels: [1, 2, 3], HTMLAttributes: {} },
        bold: { HTMLAttributes: { class: "tiptap-bold" } },
        link: { openOnClick: false },
      }),
      Highlight.configure({ multicolor: false }),
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
      Youtube.configure({
        controls: true,
        nocookie: true,
        HTMLAttributes: { class: "tiptap-youtube" },
      }),
      TableOfContents.configure({
        onUpdate(items) {
          // H2 = main entry, H3 = nested sub-entry. `originalLevel` is the real
          // heading tag; `level` is the extension's relative depth, which shifts
          // with whatever heading the doc happens to open on.
          const mapped: TocItem[] = items
            .filter(
              (item) => item.originalLevel === 2 || item.originalLevel === 3
            )
            .map((item) => ({
              id: item.id,
              level: item.originalLevel,
              textContent: item.textContent,
            }));
          setTocItems(mapped);
          tocRef.current = mapped;
        },
      }),
      TextStyle,
      Color,
      TabbedCodeBlock,
    ],
    content: initialContent,
    editorProps: {
      attributes: { class: "tiptap-content" },
      // Paste a screenshot or copied image straight into the doc. Only
      // clipboard *files* are intercepted — copied HTML with an <img> still
      // pastes through ProseMirror normally.
      handlePaste(_view, event) {
        const files = imageFilesFrom(event.clipboardData?.files);
        if (files.length === 0) return false;
        event.preventDefault();
        files.forEach((file) => uploadImageRef.current(file));
        return true;
      },
      // Drag an image file in from the desktop. `moved` means the user is
      // dragging a node that's already in the doc, which Tiptap handles itself.
      handleDrop(view, event, _slice, moved) {
        if (moved) return false;
        const files = imageFilesFrom(event.dataTransfer?.files);
        if (files.length === 0) return false;
        event.preventDefault();
        const pos = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        })?.pos;
        files.forEach((file) => uploadImageRef.current(file, pos));
        return true;
      },
    },
    onUpdate({ editor }) {
      if (!onChange) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onChange({
          content: editor.getJSON(),
          tableOfContents: tocRef.current,
        });
      }, 600);
    },
  });

  // ── Reactive editor state — updates on every cursor/selection move ──────────
  const { activeBlockType, headingLevel, inTable } = useEditorState({
    editor,
    selector: (ctx) => {
      const e = ctx.editor;
      if (!e) {
        return {
          activeBlockType: "p",
          headingLevel: undefined,
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
    async (file: File, pos?: number) => {
      if (!editor || !effectiveId) return;
      if (!file.type.startsWith("image/")) {
        alert("Please select an image file.");
        return;
      }
      if (file.size > 1.5 * 1024 * 1024) {
        alert("Image must be under 1.5MB.");
        return;
      }
      try {
        const key = await uploadFile(file, effectiveType, effectiveId);
        const chain = editor.chain().focus();
        // Dropped files land where they were dropped; pasted/picked ones at
        // the cursor. The doc can shift while the upload is in flight, so the
        // saved position is clamped to what's still valid.
        if (typeof pos === "number") {
          chain.setTextSelection(Math.min(pos, editor.state.doc.content.size));
        }
        chain.setImage({ src: key, alt: file.name }).run();
      } catch (err) {
        console.error("Image upload error:", err);
        alert("Image upload failed. Please try again.");
      }
    },
    [editor, effectiveId, effectiveType],
  );

  // Hand the uploader to the paste/drop handlers registered on the editor.
  useEffect(() => {
    uploadImageRef.current = handleImageFile;
  }, [handleImageFile]);

  useImperativeHandle(
    editorRef,
    () => ({
      replaceContent(content: object) {
        // emitUpdate keeps the two things that hang off an edit honest: the
        // table-of-contents extension recomputes, and onChange fires so the
        // page knows there is something to save.
        editor?.commands.setContent(content as never, { emitUpdate: true });
        editor?.commands.focus("start");
      },
    }),
    [editor],
  );

  const handleYoutubeEmbed = useCallback(
    (url: string) => {
      if (!editor || !url) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (editor.chain().focus() as any).setYoutubeVideo({ src: url }).run();
      setShowYoutubeModal(false);
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
          <div 
            className="sticky z-50 bg-slate-50 border-b border-slate-200 rounded-t-xl shadow-sm overflow-visible transition-all duration-200"
            style={{ top: stickyOffset !== undefined ? `${stickyOffset}px` : '-24px' }}
          >
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
              <ToolbarBtn
                title="Highlight"
                active={editor.isActive("highlight")}
                onClick={() => editor.chain().focus().toggleHighlight().run()}
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
                onClick={() =>
                  editor.chain().focus().setTextAlign("left").run()
                }
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

              {/* YouTube */}
              <ToolbarBtn
                title="Embed YouTube video"
                active={showYoutubeModal}
                onClick={() => setShowYoutubeModal(true)}
              >
                <YoutubeIcon size={ICON_SIZE} />
              </ToolbarBtn>

              {/* Code blocks — one button, two shapes. A second toolbar icon
                  for the rarer variant costs more than a two-item menu. */}
              <div className="relative" ref={codeMenuRef}>
                <ToolbarBtn
                  title="Insert code block"
                  active={showCodeMenu || showCodeModal}
                  onClick={() => setShowCodeMenu((open) => !open)}
                >
                  <Code2 size={ICON_SIZE} />
                </ToolbarBtn>

                {showCodeMenu && (
                  <div className="absolute left-0 top-full z-50 mt-1 w-60 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
                    <button
                      type="button"
                      className="w-full rounded-md px-2.5 py-1.5 text-left hover:bg-slate-100"
                      onClick={() => {
                        setShowCodeMenu(false);
                        editor.chain().focus().toggleCodeBlock().run();
                      }}
                    >
                      <span className="block text-xs font-medium text-slate-800">
                        Code block
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        One language, with a copy button
                      </span>
                    </button>
                    <button
                      type="button"
                      className="w-full rounded-md px-2.5 py-1.5 text-left hover:bg-slate-100"
                      onClick={() => {
                        setShowCodeMenu(false);
                        setShowCodeModal(true);
                      }}
                    >
                      <span className="block text-xs font-medium text-slate-800">
                        Multi-language block
                      </span>
                      <span className="block text-[11px] text-slate-500">
                        Tabs — one idea in several languages
                      </span>
                    </button>
                  </div>
                )}
              </div>

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
