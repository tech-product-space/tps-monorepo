import { Node, mergeAttributes } from "@tiptap/core";
import ImageExtension from "@tiptap/extension-image";

/**
 * Schema-only halves of the editor's two custom nodes.
 *
 * The editor extends these with React node views; the .docx importer parses
 * HTML against them as-is. Keeping the schema in one place means the JSON the
 * importer writes and the JSON the editor reads can never drift apart — a node
 * defined in only one of the two would be silently dropped on open.
 *
 * Nothing here may import React or CSS: the importer pulls this module in
 * without the editor, and that is the point.
 */

export const TabbedCodeBlockBase = Node.create({
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
});

export const CustomImageBase = ImageExtension.extend({
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
});
