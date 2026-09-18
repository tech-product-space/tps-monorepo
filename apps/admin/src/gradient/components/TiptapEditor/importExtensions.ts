import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import CodeBlock from "@tiptap/extension-code-block";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import Youtube from "@tiptap/extension-youtube";
import { Color } from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";

import { CustomImageBase, TabbedCodeBlockBase } from "./nodes";

/**
 * The schema the .docx importer parses HTML against.
 *
 * It must match TiptapEditor's extension list, or a node the importer produces
 * would be dropped the moment the lesson is opened for editing. TableOfContents
 * is the one deliberate omission — it tracks headings for the sidebar and adds
 * nothing to the schema, so parsing does not need it. The node views are
 * omitted for the same reason: parsing needs the schema, not the React.
 */
export const IMPORT_EXTENSIONS = [
  // StarterKit v3 bundles link and underline — see TiptapEditor.
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
  CodeBlock,
  Table.configure({ resizable: true }),
  TableRow,
  TableHeader,
  TableCell,
  CustomImageBase.configure({
    inline: false,
    allowBase64: false,
    HTMLAttributes: { class: "tiptap-image" },
  }),
  Youtube.configure({
    controls: true,
    nocookie: true,
    HTMLAttributes: { class: "tiptap-youtube" },
  }),
  TextStyle,
  Color,
  TabbedCodeBlockBase,
];
