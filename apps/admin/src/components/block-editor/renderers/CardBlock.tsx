"use client";

import React, { forwardRef } from "react";
import dynamic from "next/dynamic";
import { Trash2, GripVertical } from "lucide-react";

// import "react-quill-new/dist/quill.snow.css";
import "@/lib/quill/badge";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { applyBadge } from "@/lib/quill/badge";
import { useDragHandle } from "./SortableBlock";
import { BlockTypeSelect } from "./BlockTypeSelect";
import { useQuillPasteSanitizer } from "@/hooks/useQuillPasteSanitizer";
import { useQuillUncontrolled } from "../hooks/useQuillUncontrolled";
import { cleanQuillHTML } from "../utils/quillNormalizers";
import { createCode } from "../utils/blockFactory";

const ReactQuill = dynamic(
  async () => {
    const mod = await import("react-quill-new");
    return forwardRef<any, any>((props, ref) => (
      <mod.default {...props} ref={ref} />
    ));
  },
  { ssr: false },
);

const quillModules = {
  toolbar: {
    container: [
      [{ header: [3, 4, false] }],
      ["bold", "italic", "underline", "strike"],
      [{ color: [] }, { background: [] }],
      [{ script: "sub" }, { script: "super" }],
      [{ list: "ordered" }, { list: "bullet" }],
      [{ indent: "-1" }, { indent: "+1" }],
      [{ align: [] }],
      ["blockquote", "code-block"],
      ["link"],
      ["badge"],
      ["clean"],
    ],
    handlers: {
      badge: applyBadge,
    },
  },
  clipboard: { matchVisual: false },
};

const quillFormats = [
  "header",
  "bold",
  "italic",
  "underline",
  "strike",
  "color",
  "background",
  "script",
  "list",
  "indent",
  "align",
  "blockquote",
  "code-block",
  "link",
  "badge",
];

const VARIANTS = ["default", "success", "destructive", "info", "warning"];

export function CardBlock({ block, actions }: any) {
  const { setActivatorNodeRef, listeners, attributes } = useDragHandle();

  const { quillRef, handleChange } = useQuillUncontrolled(
    block.data.html || "",
    (value) => actions.update(block.id, { html: value }),
    cleanQuillHTML
  );

  useQuillPasteSanitizer(quillRef, {
    onFencedCode: (fenced) => {
      const b = createCode();
      b.data.code = fenced.code;
      b.data.language = fenced.language;
      actions.replace?.(block.id, b);
    },
  });

  const handleVariantChange = (value: string) => {
    actions.update(block.id, { variant: value });
  };

  const variantClass =
    block.data.variant === "success"
      ? "border-green-400 bg-green-50"
      : block.data.variant === "destructive"
        ? "border-red-400 bg-red-50"
        : block.data.variant === "info"
          ? "border-blue-400 bg-blue-50"
          : block.data.variant === "warning"
            ? "border-yellow-400 bg-yellow-50"
            : "border-muted bg-background";

  return (
    <div className={`rounded-lg border shadow-sm ${variantClass}`}>
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
          <BlockTypeSelect block={block} actions={actions} />
        </div>

        <div className="flex items-center gap-2">
          {/* Variant selector */}
          <Select
            value={block.data.variant || "default"}
            onValueChange={handleVariantChange}
          >
            <SelectTrigger className="h-7 w-[110px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VARIANTS.map((v) => (
                <SelectItem key={v} value={v}>
                  <span className="capitalize">{v}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
      <div className="p-3"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ReactQuill
          ref={quillRef}
          theme="snow"
          defaultValue={block.data.html || ""}
          onChange={handleChange}
          modules={quillModules}
          formats={quillFormats}
          placeholder="Write card content..."
          className="bg-white large-quill"
        />
      </div>
    </div>
  );
}
