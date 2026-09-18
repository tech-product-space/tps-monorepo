"use client";

import React, { useRef, forwardRef, useCallback } from "react";
import { Trash2, GripVertical } from "lucide-react";
import dynamic from "next/dynamic";

import "react-quill-new/dist/quill.snow.css";
import { Button } from "@/components/ui/button";
import { useDragHandle } from "./SortableBlock";
import { BlockTypeSelect } from "./BlockTypeSelect";
import { useQuillPasteSanitizer } from "@/hooks/useQuillPasteSanitizer";
import { useQuillUncontrolled } from "../hooks/useQuillUncontrolled";
import { normalizeHeadingHTML } from "../utils/quillNormalizers";

const ReactQuill = dynamic(async () => {
  const mod = await import("react-quill-new");
  return forwardRef<any, any>((props, ref) => (
    <mod.default {...props} ref={ref} />
  ));
}, { ssr: false });

const quillModules = {
  toolbar: [
    [{ header: [2, 3] }],
    ["bold", "italic", "underline"],
    [{ align: [] }],
    ["clean"],
  ],
  clipboard: { matchVisual: false },
};

const quillFormats = ["header", "bold", "italic", "underline", "align"];

export function HeaderBlock({ block, actions }: any) {
  const { setActivatorNodeRef, listeners, attributes } = useDragHandle();

  const { quillRef, handleChange } = useQuillUncontrolled(
    block.data.html || "",
    (value) => actions.update(block.id, { html: value }),
    normalizeHeadingHTML
  );

  useQuillPasteSanitizer(quillRef);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <div className="rounded-lg border bg-background shadow-sm">
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

        <Button
          variant="ghost"
          size="icon"
          onClick={() => actions.remove(block.id)}
          className="h-7 w-7"
        >
          <Trash2 className="h-4 w-4 text-red-500" />
        </Button>
      </div>

      {/* Editor */}
      <div className="p-3"
        onKeyDown={handleKeyDown}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ReactQuill
          ref={quillRef}
          theme="snow"
          defaultValue={block.data.html || ""}
          onChange={handleChange}
          modules={quillModules}
          formats={quillFormats}
          placeholder="Write heading..."
          className="bg-white large-quill"
        />
      </div>
    </div>
  );
}
