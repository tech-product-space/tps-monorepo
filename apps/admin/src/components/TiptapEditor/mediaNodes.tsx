"use client";

import { useState } from "react";
import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  NodeViewProps,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── YouTube URL helpers (shared shape with the public renderer) ──────────────
export function extractYouTubeVideoId(url: string | undefined | null): string | null {
  if (!url) return null;
  const u = url.trim();
  const patterns = [
    /(?:youtube\.com\/.*v=|youtube\.com\/embed\/|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
    /v=([A-Za-z0-9_-]{11})/,
    /youtu\.be\/([A-Za-z0-9_-]{11})/,
  ];
  for (const p of patterns) {
    const m = u.match(p);
    if (m && m[1]) return m[1];
  }
  return null;
}

export function buildYouTubeEmbedUrl(
  videoId: string,
  loop = false,
  autoplay = false,
  muted = false,
) {
  const params = new URLSearchParams({
    rel: "0",
    controls: "1",
    modestbranding: "1",
    autoplay: autoplay ? "1" : "0",
    // Autoplay forces mute (browser policy); otherwise honour the mute flag.
    mute: autoplay || muted ? "1" : "0",
  });
  if (loop) {
    params.set("loop", "1");
    params.set("playlist", videoId);
  }
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

const WIDTH_PRESETS = [
  { label: "25%", value: "25%" },
  { label: "50%", value: "50%" },
  { label: "75%", value: "75%" },
  { label: "100%", value: "100%" },
];

// ─── Overlay shown when a media node is selected ──────────────────────────────
function MediaOverlay({
  loop,
  autoplay,
  muted,
  width,
  onUpdate,
  onDelete,
  showWidth,
}: {
  loop: boolean;
  autoplay: boolean;
  muted: boolean;
  width?: string;
  showWidth?: boolean;
  onUpdate: (attrs: Record<string, unknown>) => void;
  onDelete: () => void;
}) {
  const toggleBtn = (label: string, active: boolean, key: string) => (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault();
        onUpdate({ [key]: !active });
      }}
      className={cn(
        "text-[11px] font-medium px-2 py-0.5 rounded border transition-colors",
        active
          ? "bg-blue-500 text-white border-blue-600"
          : "bg-transparent text-[#a0a0b8] border-[#3b3b52] hover:bg-[#2e2e44] hover:text-[#e0e0f0]",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[#1e1e2e] border border-[#3b3b52] rounded-md px-1.5 py-1 z-[100] shadow-lg whitespace-nowrap">
      {showWidth &&
        WIDTH_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            className={cn(
              "text-[11px] font-medium px-2 py-0.5 rounded border transition-colors",
              width === preset.value
                ? "bg-blue-500 text-white border-blue-600"
                : "bg-transparent text-[#a0a0b8] border-transparent hover:bg-[#2e2e44] hover:text-[#e0e0f0]",
            )}
            onMouseDown={(e) => {
              e.preventDefault();
              onUpdate({ width: preset.value });
            }}
          >
            {preset.label}
          </button>
        ))}
      {showWidth && <span className="w-px h-4 bg-[#3b3b52] mx-0.5" />}
      {toggleBtn("Loop", loop, "loop")}
      {toggleBtn("Autoplay", autoplay, "autoplay")}
      {toggleBtn("Mute", muted, "muted")}
      <span className="w-px h-4 bg-[#3b3b52] mx-0.5" />
      <button
        type="button"
        title="Remove"
        onMouseDown={(e) => {
          e.preventDefault();
          onDelete();
        }}
        className="text-[11px] px-1.5 py-0.5 rounded text-red-300 hover:text-white hover:bg-red-600/80 transition-colors"
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

// ─── Custom Video (mp4 / hosted URL) ──────────────────────────────────────────
function VideoNodeView({
  node,
  updateAttributes,
  selected,
  deleteNode,
}: NodeViewProps) {
  const { src, poster, loop, autoplay, muted, width } = node.attrs as {
    src: string;
    poster?: string;
    loop: boolean;
    autoplay: boolean;
    muted: boolean;
    width?: string;
  };
  const [hovered, setHovered] = useState(false);

  return (
    <NodeViewWrapper className="tiptap-video-wrapper" data-drag-handle>
      <div
        style={{
          position: "relative",
          display: "inline-block",
          width: width ?? "100%",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {(selected || hovered) && (
          <MediaOverlay
            loop={loop}
            autoplay={autoplay}
            muted={muted}
            width={width}
            showWidth
            onUpdate={updateAttributes}
            onDelete={deleteNode}
          />
        )}
        {/* Non-interactive in the editor: clicks select the node (so the
            controls appear) instead of playing the video. */}
        <video
          src={src}
          poster={poster || undefined}
          loop={loop}
          muted={muted}
          playsInline
          style={{
            width: "100%",
            display: "block",
            borderRadius: 8,
            pointerEvents: "none",
          }}
          className={cn(selected && "ring-2 ring-blue-500")}
        />
      </div>
    </NodeViewWrapper>
  );
}

export const CustomVideo = Node.create({
  name: "customVideo",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: "" },
      poster: { default: "" },
      loop: { default: false },
      autoplay: { default: false },
      muted: { default: false },
      width: { default: "100%" },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="custom-video"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "custom-video" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoNodeView);
  },
});

// ─── Custom YouTube (with loop / autoplay) ────────────────────────────────────
function YoutubeNodeView({
  node,
  updateAttributes,
  selected,
  deleteNode,
}: NodeViewProps) {
  const { src, loop, autoplay, muted } = node.attrs as {
    src: string;
    loop: boolean;
    autoplay: boolean;
    muted: boolean;
  };
  const videoId = extractYouTubeVideoId(src);
  const [hovered, setHovered] = useState(false);

  return (
    <NodeViewWrapper className="tiptap-youtube-wrapper" data-drag-handle>
      <div
        style={{ position: "relative" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {(selected || hovered) && (
          <MediaOverlay
            loop={loop}
            autoplay={autoplay}
            muted={muted}
            onUpdate={updateAttributes}
            onDelete={deleteNode}
          />
        )}
        {videoId ? (
          <div
            className={cn(
              "relative w-full max-w-[720px] mx-auto rounded-lg overflow-hidden",
              selected && "ring-2 ring-blue-500",
            )}
            style={{ aspectRatio: "16 / 9" }}
          >
            <iframe
              // Non-interactive in the editor: clicks select the node (so the
              // controls appear) instead of starting playback.
              className="absolute inset-0 w-full h-full pointer-events-none"
              // Editor preview never autoplays — only loop is reflected.
              src={buildYouTubeEmbedUrl(videoId, loop, false)}
              title="YouTube video"
              frameBorder="0"
              allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        ) : (
          <div className="rounded-lg bg-gray-50 border p-4 text-sm text-muted-foreground">
            Invalid YouTube URL: {src}
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
}

export const CustomYoutube = Node.create({
  // Named "youtube" so any earlier built-in youtube nodes still parse.
  name: "youtube",
  group: "block",
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: "" },
      loop: { default: false },
      autoplay: { default: false },
      muted: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="custom-youtube"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "custom-youtube" }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(YoutubeNodeView);
  },
});
