"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

import { langLabel } from "../utils/codeLanguages";
import { highlightCode } from "../utils/prism";

// Renders code with Prism syntax highlighting inside the shared `.block-code`
// dark theme. A header bar shows the filename/language and a copy button.
export function CodePreview({ block }: any) {
  const code: string = block.data.code || "";
  const language: string = block.data.language || "plaintext";
  const filename: string = block.data.filename || "";

  const [copied, setCopied] = useState(false);
  const { id, html } = highlightCode(code, language);
  const label = filename || (language === "plaintext" ? "" : langLabel(language));

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  return (
    <div className="block-code prism-code-dark">
      <div className="block-code-head">
        <span className="block-code-lang">{label}</span>
        <button type="button" className="block-code-copy" onClick={copy}>
          {copied ? (
            <>
              <Check size={13} /> Copied
            </>
          ) : (
            <>
              <Copy size={13} /> Copy
            </>
          )}
        </button>
      </div>
      <pre className={id ? `language-${id}` : undefined}>
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}
