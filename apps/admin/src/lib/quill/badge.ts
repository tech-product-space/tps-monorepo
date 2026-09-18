import Quill from "quill";

const InlineBlot = Quill.import("blots/inline") as any;

class BadgeBlot extends InlineBlot {
  static blotName = "badge";
  static tagName = "span";
  static className = "ql-badge";

  static create() {
    const node = super.create() as HTMLElement;
    return node;
  }

  static formats() {
    return true;
  }
}

// register blot
(Quill as any).register(BadgeBlot);

// toolbar icon
const icons = Quill.import("ui/icons") as any;
icons["badge"] = `
<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#000" stroke-width="2">
  <path d="M20.59 13.41L11 3H4v7l9.59 9.59a2 2 0 0 0 2.82 0l4.18-4.18a2 2 0 0 0 0-2.82z"/>
  <circle cx="7.5" cy="7.5" r="1.5"/>
</svg>
`;

export function applyBadge(this: any) {
  const quill = this.quill;
  if(!quill) return;
  
  const range = quill.getSelection();
  if (!range || range.length === 0) return;

  quill.formatText(range.index, range.length, "badge", true);
  quill.setSelection(range.index + range.length);
}