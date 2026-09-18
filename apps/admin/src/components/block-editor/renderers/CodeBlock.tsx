"use client";

import React, { useRef, useState } from "react";
import Editor from "react-simple-code-editor";
import { Trash2, GripVertical, Code2, Upload, Copy, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDragHandle } from "./SortableBlock";
import {
  CODE_LANGUAGES,
  CODE_FILE_ACCEPT,
  langFromFilename,
} from "../utils/codeLanguages";
import { highlightCode } from "../utils/prism";

// A first-class code block: raw source stored as a string (never HTML). Edited
// in a Prism-highlighted code editor so it looks and feels like code, not plain
// text. `language` also drives the highlighting and the file-import inference.
export function CodeBlock({ block, actions }: any) {
  const { setActivatorNodeRef, listeners, attributes } = useDragHandle();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  const code: string = block.data.code || "";
  const language: string = block.data.language || "plaintext";
  const filename: string = block.data.filename || "";

  // A language chosen elsewhere (e.g. a fenced import of "kotlin") may not be in
  // the curated dropdown; surface it so the Select still shows it.
  const options = CODE_LANGUAGES.some((l) => l.value === language)
    ? CODE_LANGUAGES
    : [{ value: language, label: language }, ...CODE_LANGUAGES];

  const update = (patch: Record<string, any>) => actions.update(block.id, patch);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    const text = await file.text();
    update({
      code: text,
      language: langFromFilename(file.name),
      filename: file.name,
    });
  };

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
    <div className="rounded-lg border bg-background shadow-sm overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span
            ref={setActivatorNodeRef}
            {...listeners}
            {...attributes}
            className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-muted"
          >
            <GripVertical className="h-4 w-4" />
          </span>
          <Code2 className="h-4 w-4" />
          Code
        </div>

        <div className="flex items-center gap-2">
          {/* Language selector */}
          <Select value={language} onValueChange={(v) => update({ language: v })}>
            <SelectTrigger className="h-7 w-[140px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((l) => (
                <SelectItem key={l.value} value={l.value}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Copy */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={copy}
          >
            {copied ? (
              <>
                <Check className="h-3 w-3" /> Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" /> Copy
              </>
            )}
          </Button>

          {/* Import from file */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-3 w-3" /> Import file
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept={CODE_FILE_ACCEPT}
            onChange={handleFile}
          />

          {/* Delete */}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => actions.remove(block.id)}
            className="h-7 w-7"
          >
            <Trash2 className="h-4 w-4 text-red-500" />
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div className="p-3 space-y-2" onPointerDown={(e) => e.stopPropagation()}>
        <Input
          placeholder="Filename (optional, e.g. app.py)"
          value={filename}
          onChange={(e) => update({ filename: e.target.value })}
          className="h-8 text-xs"
        />
        <div
          className="prism-code-dark rounded-md border border-[#1f2937] overflow-auto"
          style={{ background: "#0b0e14" }}
        >
          <Editor
            value={code}
            onValueChange={(v) => update({ code: v })}
            highlight={(c) => highlightCode(c, language).html}
            padding={12}
            tabSize={2}
            insertSpaces
            placeholder="Paste or type code..."
            textareaClassName="code-editor-textarea"
            style={{
              fontFamily: '"JetBrains Mono", Consolas, Monaco, monospace',
              fontSize: 13,
              lineHeight: 1.6,
              minHeight: 160,
              color: "#c9d1d9",
              caretColor: "#c9d1d9",
            }}
          />
        </div>
      </div>
    </div>
  );
}
