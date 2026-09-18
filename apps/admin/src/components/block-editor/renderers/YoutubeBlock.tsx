"use client";

import React from "react";
import { Trash2, Youtube as YoutubeIcon, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useDragHandle } from "./SortableBlock";

// Moved to ../utils/youtube so the content importer can share them without
// pulling in this client component. Re-exported here for existing importers.
import { buildYoutubeEmbedUrl } from "../utils/youtube";
export { extractYoutubeId, buildYoutubeEmbedUrl } from "../utils/youtube";

export function YoutubeBlock({ block, actions }: any) {
  const { setActivatorNodeRef, listeners, attributes } = useDragHandle();
  const {
    src,
    alt,
    caption,
    credit,
    loop = false,
    autoplay = false,
    width = "100",
    alignment = "center",
  } = block.data;

  const updateData = (updates: any) => actions.update(block.id, updates);

  const embedUrl = buildYoutubeEmbedUrl(src, { loop, autoplay });

  const containerStyle: React.CSSProperties = {
    width: `${width}%`,
    margin:
      alignment === "center"
        ? "0 auto"
        : alignment === "right"
          ? "0 0 0 auto"
          : "0 auto 0 0",
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
          <YoutubeIcon className="h-4 w-4" />
          YouTube
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

      <div className="p-4 space-y-4">
        <div className="grid gap-1">
          <label className="text-[10px] font-medium uppercase text-muted-foreground px-1">
            YouTube URL
          </label>
          <Input
            placeholder="https://youtu.be/VIDEO_ID or https://www.youtube.com/watch?v=VIDEO_ID"
            value={src || ""}
            onChange={(e) => updateData({ src: e.target.value })}
            className="h-9 text-sm"
          />
          {src && !embedUrl && (
            <p className="text-xs text-red-500 px-1">
              Could not parse a YouTube video ID from this URL.
            </p>
          )}
        </div>

        {/* Embed preview */}
        {embedUrl && (
          <div className="rounded-md overflow-hidden bg-muted p-4">
            <div style={containerStyle}>
              <div className="relative w-full" style={{ paddingTop: "56.25%" }}>
                <iframe
                  src={embedUrl}
                  title={alt || "YouTube video"}
                  className="absolute inset-0 h-full w-full rounded"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
            </div>
          </div>
        )}

        {/* Common settings */}
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
              placeholder="Describe video for screen readers..."
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

          <div className="grid gap-1">
            <label className="text-[10px] font-medium uppercase text-muted-foreground px-1">
              Credit
            </label>
            <Input
              placeholder="Credit (optional)..."
              value={credit || ""}
              onChange={(e) => updateData({ credit: e.target.value })}
              className="h-9 text-sm"
            />
          </div>

          <div className="flex items-center gap-6 pt-1">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={loop}
                onCheckedChange={(v) => updateData({ loop: !!v })}
              />
              Loop
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={autoplay}
                onCheckedChange={(v) => updateData({ autoplay: !!v })}
              />
              Autoplay
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
