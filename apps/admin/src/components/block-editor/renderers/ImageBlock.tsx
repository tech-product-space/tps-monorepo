"use client";

import React, { useState } from "react";
import {
  Trash2,
  Image as ImageIcon,
  Upload,
  Loader2,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDragHandle } from "./SortableBlock";
import {
  uploadWrittenCourseFile,
  deleteWrittenCourseFile,
} from "@/services/written-course/wrttenCourseService";
import { resolveStorageUrl } from "@/lib/stoage";

export function ImageBlock({ block, actions }: any) {
  const { setActivatorNodeRef, listeners, attributes } = useDragHandle();
  const [isUploading, setIsUploading] = useState(false);
  const { key, alt, caption, width = "100", alignment = "center" } = block.data;
  const courseId = actions.extraData?.courseId;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!courseId) {
      alert(
        "Course ID is required for upload. Please ensure the course is saved.",
      );
      return;
    }

    try {
      setIsUploading(true);
      const response = await uploadWrittenCourseFile(file, courseId);

      // Extract fileName from URL
      const fileName = response.fileUrl.split("/").pop();
      // Construct the key as per backend structure
      const fullKey = `written-course/${courseId}/${fileName}`;

      actions.update(block.id, {
        key: fullKey,
      });
    } catch (error) {
      console.error("Upload failed:", error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDelete = async () => {
    if (courseId && key) {
      try {
        await deleteWrittenCourseFile(key);
      } catch (error) {
        console.error("Failed to delete file from server:", error);
      }
    }

    actions.update(block.id, { key: "" });
  };

  const updateData = (updates: any) => {
    actions.update(block.id, updates);
  };

  const imageUrl = resolveStorageUrl(key);

  const imageStyle: React.CSSProperties = {
    width: `${width}%`,
    margin:
      alignment === "center"
        ? "0 auto"
        : alignment === "right"
          ? "0 0 0 auto"
          : "0 auto 0 0",
    display: "block",
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
          <ImageIcon className="h-4 w-4" />
          Image
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

      <div className="p-4">
        {!key ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 bg-muted/20 relative min-h-[200px]">
            {isUploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  Uploading image...
                </p>
              </div>
            ) : (
              <label className="flex flex-col items-center gap-2 cursor-pointer group w-full h-full justify-center">
                <div className="p-3 rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG, GIF up to 1MB
                  </p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  accept="image/*"
                  onChange={handleFileChange}
                />
              </label>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative group rounded-md overflow-hidden bg-muted p-4">
              <img
                src={imageUrl}
                alt={alt || "Block Image"}
                style={imageStyle}
                className="h-auto max-h-[500px] object-contain transition-transform duration-300 group-hover:scale-[1.01]"
              />
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleDelete}
                  className="h-8 text-xs gap-1 shadow-md bg-white/90 hover:bg-white text-black"
                >
                  <Trash2 className="h-3 w-3" /> Remove
                </Button>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1">
                  <label className="text-[10px] font-medium uppercase text-muted-foreground px-1">
                    Width (%)
                  </label>
                  <Input
                    type="number"
                    min="10"
                    max="100"
                    value={width}
                    onChange={(e) => updateData({ width: e.target.value })}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="grid gap-1">
                  <label className="text-[10px] font-medium uppercase text-muted-foreground px-1">
                    Alignment
                  </label>
                  <select
                    value={alignment}
                    onChange={(e) => updateData({ alignment: e.target.value })}
                    className="h-9 text-sm rounded-md border border-input bg-background px-3 outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
              </div>
              <div className="grid gap-1">
                <label className="text-[10px] font-medium uppercase text-muted-foreground px-1">
                  Alt Text
                </label>
                <Input
                  placeholder="Describe image for screen readers..."
                  value={alt || ""}
                  onChange={(e) => updateData({ alt: e.target.value })}
                  className="h-9 text-sm"
                />
              </div>
              <div className="grid gap-1">
                <label className="text-[10px] font-medium uppercase text-muted-foreground px-1">
                  Caption
                </label>
                <Input
                  placeholder="Add a caption (optional)..."
                  value={caption || ""}
                  onChange={(e) => updateData({ caption: e.target.value })}
                  className="h-9 text-sm"
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
