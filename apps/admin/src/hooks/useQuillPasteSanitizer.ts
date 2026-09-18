import { useEffect, useRef } from "react";
import {
  parseSingleFencedBlock,
  FencedBlock,
} from "@/components/Pages/Common/Free-Courses/import/parseFencedCode";

interface PasteSanitizerOptions {
  // Called when a *pure* triple-backtick fenced block is pasted into an empty
  // editor — the caller turns it into a code block instead of pasted text.
  onFencedCode?: (fenced: FencedBlock) => void;
}

export function sanitizeHtml(html: string): string {
    if (typeof window === "undefined") return html;

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");

    const ALLOWED_TAGS = new Set([
        "b", "strong", "i", "em", "u", "s", "strike", "del",
        "a", "br", "p", "ul", "ol", "li",
        "blockquote", "h1", "h2", "h3", "h4", "h5", "h6",
        "pre", "code",
        "table", "thead", "tbody", "tfoot", "tr", "th", "td", "colgroup", "col",
    ]);

    const ALLOWED_ATTRS: Record<string, string[]> = {
        a: ["href", "target", "rel"],
        th: ["colspan", "rowspan", "scope"],
        td: ["colspan", "rowspan"],
        col: ["span"],
    };

    const TAG_MAP: Record<string, string> = {
        strong: "b", em: "i", del: "s", strike: "s",
    };

    function clean(node: Node): Node | null {
        if (node.nodeType === Node.TEXT_NODE) return node.cloneNode();
        if (node.nodeType !== Node.ELEMENT_NODE) return null;

        const el = node as Element;
        const tag = el.tagName.toLowerCase();
        const outTag = TAG_MAP[tag] ?? tag;

        if (!ALLOWED_TAGS.has(outTag)) {
            const frag = doc.createDocumentFragment();
            el.childNodes.forEach((child) => {
                const c = clean(child);
                if (c) frag.appendChild(c);
            });
            return frag;
        }

        const out = doc.createElement(outTag);
        (ALLOWED_ATTRS[outTag] ?? []).forEach((attr) => {
            const val = el.getAttribute(attr);
            if (val) out.setAttribute(attr, val);
        });

        el.childNodes.forEach((child) => {
            const c = clean(child);
            if (c) out.appendChild(c);
        });

        if (outTag === "li" && (out.textContent ?? "").trim() === "") return null;
        if ((outTag === "ul" || outTag === "ol") && out.childNodes.length === 0) return null;
        if (outTag === "p") {
            const isEmpty = (out.textContent ?? "").trim() === "";
            const hasOnlyBr =
                out.childNodes.length === 1 &&
                (out.firstChild as Element)?.tagName?.toLowerCase() === "br";
            if (isEmpty || hasOnlyBr) return null;
        }

        return out;
    }

    const output = doc.createElement("div");
    doc.body.childNodes.forEach((child) => {
        const c = clean(child);
        if (c) output.appendChild(c);
    });

    return output.innerHTML;
}

export function useQuillPasteSanitizer(
    quillRef: React.RefObject<any>,
    options?: PasteSanitizerOptions,
) {
    const isPasting = useRef(false);
    // Kept in a ref so the (stable) paste listener always sees the latest handler
    // without re-binding on every render.
    const onFencedCode = useRef(options?.onFencedCode);
    onFencedCode.current = options?.onFencedCode;

    useEffect(() => {
        const quill = quillRef.current?.getEditor?.();
        if (!quill) return;

        const clipboard = quill.clipboard;
        const editor: HTMLElement = quill.root;

        const handler = (e: ClipboardEvent) => {
            if (isPasting.current) return;

            // Fenced-code fast path: a paste that is *exactly* one ``` … ```
            // block, dropped into an empty editor, becomes a code block. The
            // empty check keeps prose paste (and mid-text paste) untouched.
            const handleFenced = onFencedCode.current;
            if (handleFenced) {
                const plain = e.clipboardData?.getData("text/plain") ?? "";
                const fenced = parseSingleFencedBlock(plain);
                const isEmpty = (quill.getText() ?? "").replace(/\s/g, "") === "";
                if (fenced && isEmpty) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    handleFenced(fenced);
                    return;
                }
            }

            const html = e.clipboardData?.getData("text/html");
            if (!html) return;

            e.preventDefault();
            e.stopImmediatePropagation();

            isPasting.current = true;

            try {
                const cleanHtml = sanitizeHtml(html);
                const range = quill.getSelection(true);
                const index = range?.index ?? 0;

                if (range?.length) {
                    quill.deleteText(index, range.length, "user");
                }

                const isTablePaste = /<table[\s>]/i.test(cleanHtml);

                if (isTablePaste) {
                    quill.clipboard.dangerouslyPasteHTML(index, cleanHtml, "user");
                    return;
                }

                const delta = clipboard.convert({ html: cleanHtml, text: "" });

                quill.updateContents(
                    { ops: [{ retain: index }, ...delta.ops] },
                    "user",
                );

                const insertedLength = delta.length() - 1;
                quill.setSelection(index + Math.max(0, insertedLength), 0, "user");
            } finally {
                isPasting.current = false;
            }
        };

        editor.addEventListener("paste", handler, true);
        return () => editor.removeEventListener("paste", handler, true);

        // quillRef.current won't trigger re-run on its own since refs are stable —
        // we use a getter call as the dep so the effect re-runs once Quill mounts
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [quillRef.current?.getEditor?.()]);
}