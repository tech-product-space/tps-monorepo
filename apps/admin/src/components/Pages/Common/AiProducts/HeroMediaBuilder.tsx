"use client";

import React from "react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useState } from "react";
import { GripVertical, Image as ImageIcon, Play, Plus, Trash2, Youtube } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { HeroMediaItem } from "@/types/aiProduct";
import { resolveAssetUrl, toYouTubeEmbed } from "@/services/ai-products/aiProductService";
import ImageUploadField from "./ImageUploadField";

// Video preview: shows the thumbnail (custom or YouTube's) with a play
// button; clicking swaps in the playing embed.
function VideoPreview({ item }: { item: HeroMediaItem }) {
  const [playing, setPlaying] = useState(false);
  const embed = toYouTubeEmbed(item.url);
  if (!embed) return null;

  if (playing) {
    return (
      <iframe
        src={`${embed}?autoplay=1`}
        title="YouTube preview"
        className="w-full aspect-video rounded border"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    );
  }

  const videoIdMatch = embed.match(/embed\/([\w-]{11})/);
  const poster = item.thumbnailUrl
    ? resolveAssetUrl(item.thumbnailUrl)
    : videoIdMatch
    ? `https://img.youtube.com/vi/${videoIdMatch[1]}/hqdefault.jpg`
    : "";

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      className="relative block w-full aspect-video rounded border overflow-hidden group"
      title="Play video"
    >
      {poster && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-black/20">
        <span className="w-12 h-12 rounded-full bg-black/60 border border-white/50 flex items-center justify-center transition-transform group-hover:scale-110">
          <Play size={18} className="text-white fill-white ml-0.5" />
        </span>
      </span>
    </button>
  );
}

type Props = {
  items: HeroMediaItem[];
  onChange: (items: HeroMediaItem[]) => void;
};

function SortableMediaRow({
  item,
  onUpdate,
  onDelete,
}: {
  item: HeroMediaItem;
  onUpdate: (patch: Partial<HeroMediaItem>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-white border rounded-lg shadow-sm">
      <div className="flex items-center gap-2 p-3 border-b">
        <button type="button" {...attributes} {...listeners} className="cursor-grab text-gray-400">
          <GripVertical size={16} />
        </button>
        <Badge variant="outline" className="text-[10px] uppercase gap-1">
          {item.type === "video" ? <Youtube size={10} /> : <ImageIcon size={10} />}
          {item.type === "video" ? "YouTube" : "Image"}
        </Badge>
        <span className="flex-1" />
        <Button type="button" size="icon" variant="ghost" onClick={onDelete}>
          <Trash2 size={15} className="text-red-500" />
        </Button>
      </div>

      <div className="p-4 space-y-3">
        {item.type === "image" ? (
          <ImageUploadField
            label="Image"
            value={item.url}
            onChange={(url) => onUpdate({ url })}
            hint="1920×1080px (16:9)"
            previewClassName="w-full aspect-video rounded border object-cover"
          />
        ) : (
          <>
            <div className="space-y-1.5">
              <Label>YouTube link</Label>
              <Input
                value={item.url}
                onChange={(e) => onUpdate({ url: e.target.value })}
                placeholder="https://www.youtube.com/watch?v=…"
              />
              {item.url && !toYouTubeEmbed(item.url) && (
                <p className="text-xs text-red-500">
                  Not a valid YouTube link — paste a youtube.com or youtu.be URL.
                </p>
              )}
            </div>
            <ImageUploadField
              label="Thumbnail (optional)"
              value={item.thumbnailUrl || ""}
              onChange={(thumbnailUrl) => onUpdate({ thumbnailUrl })}
              hint="1280×720px (16:9) — shown in the slider before the video plays; defaults to the YouTube thumbnail"
              previewClassName="h-16 rounded border object-cover"
            />
            <VideoPreview item={item} />
          </>
        )}
      </div>
    </div>
  );
}

export default function HeroMediaBuilder({ items, onChange }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const addItem = (type: "image" | "video") => {
    onChange([...items, { id: crypto.randomUUID(), type, url: "" }]);
  };

  const updateItem = (id: string, patch: Partial<HeroMediaItem>) => {
    onChange(items.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((m) => m.id === active.id);
    const newIndex = items.findIndex((m) => m.id === over.id);
    onChange(arrayMove(items, oldIndex, newIndex));
  };

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={items.map((m) => m.id)} strategy={verticalListSortingStrategy}>
          {items.map((item) => (
            <SortableMediaRow
              key={item.id}
              item={item}
              onUpdate={(patch) => updateItem(item.id, patch)}
              onDelete={() => onChange(items.filter((m) => m.id !== item.id))}
            />
          ))}
        </SortableContext>
      </DndContext>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" className="gap-1.5">
            <Plus size={16} />
            Add media
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => addItem("image")} className="gap-2">
            <ImageIcon size={14} />
            Image
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => addItem("video")} className="gap-2">
            <Youtube size={14} />
            YouTube video
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
