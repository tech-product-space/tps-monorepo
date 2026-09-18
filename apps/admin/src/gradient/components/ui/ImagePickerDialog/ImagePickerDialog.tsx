"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/gradient/components/ui/dialog";
import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { ScrollArea } from "@/gradient/components/ui/scroll-area";
import { ImageIcon, Loader2, Maximize2, UploadCloud, X } from "lucide-react";

import { getMediaAssets, uploadMediaAsset } from "@/gradient/services/fileUpload";
import { resolveStorageUrl } from "@/gradient/lib/storage";

type MediaAssetType = "event" | "blog" | "resource" | "job" | "certificate" | "recording";

type ImageItem = {
  key: string;
  lastModified?: string;
  size?: number;
};

type Dimensions = { width: number; height: number };

type Props = {
  onSelect: (key: string) => void;
};

// Checkerboard, so transparent PNGs and letterboxed images stay readable
// against the tile background instead of blending into it.
const checkerboard: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, rgba(0,0,0,0.05) 25%, transparent 25%), linear-gradient(-45deg, rgba(0,0,0,0.05) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.05) 75%), linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.05) 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
};

const fileNameOf = (key: string) => key.split("/").pop() ?? key;

export function ImagePickerDialog({ onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<MediaAssetType>("event");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [images, setImages] = useState<Record<MediaAssetType, ImageItem[]>>({
    event: [],
    blog: [],
    resource: [],
    job: [],
    certificate: [],
    recording: [],
  });
  const [fetchedTabs, setFetchedTabs] = useState<Set<MediaAssetType>>(
    new Set(),
  );
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dimensions, setDimensions] = useState<Record<string, Dimensions>>({});
  const [preview, setPreview] = useState<string | null>(null);

  const fetchImages = useCallback(
    async (type: MediaAssetType, force = false) => {
      if (fetchedTabs.has(type) && !force) return;

      setLoading(true);
      setError(null);

      try {
        const images = await getMediaAssets(type);
        setImages((prev) => ({ ...prev, [type]: images }));
        setFetchedTabs((prev) => new Set([...prev, type]));
      } catch (err: any) {
        setError(err.message ?? "Failed to load images");
      } finally {
        setLoading(false);
      }
    },
    [fetchedTabs],
  );

  useEffect(() => {
    if (open) fetchImages(activeTab);
  }, [open, activeTab]);

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Only image files are allowed.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const key = await uploadMediaAsset(file, activeTab);

      setImages((prev) => ({
        ...prev,
        [activeTab]: [{ key }, ...prev[activeTab]],
      }));
    } catch (err: any) {
      setError(err.message ?? "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUpload(file);
  };

  const handleImageLoad = (
    key: string,
    e: React.SyntheticEvent<HTMLImageElement>,
  ) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (!naturalWidth || !naturalHeight) return;

    setDimensions((prev) =>
      prev[key]
        ? prev
        : { ...prev, [key]: { width: naturalWidth, height: naturalHeight } },
    );
  };

  const handlePick = (key: string) => {
    onSelect(key);
    setPreview(null);
    setOpen(false);
  };

  const renderGrid = (items: ImageItem[]) => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span className="text-sm">Loading images…</span>
        </div>
      );
    }

    if (items.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
          <ImageIcon className="w-8 h-8 opacity-30" />
          <span className="text-sm">No images yet for this category</span>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mt-4 pr-2">
        {items.map((img) => {
          const dims = dimensions[img.key];

          return (
            <div
              key={img.key}
              className="group border rounded-lg overflow-hidden transition-all hover:border-primary hover:shadow-sm"
            >
              <div
                role="button"
                tabIndex={0}
                title={img.key}
                onClick={() => handlePick(img.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handlePick(img.key);
                  }
                }}
                className="relative flex items-center justify-center aspect-square cursor-pointer"
                style={checkerboard}
              >
                {/* object-contain, never object-cover: assets here range from
                    wide banners to portrait headshots and square logos. */}
                <img
                  src={resolveStorageUrl(img.key)}
                  alt={img.key}
                  loading="lazy"
                  onLoad={(e) => handleImageLoad(img.key, e)}
                  className="max-w-full max-h-full object-contain"
                />

                <button
                  type="button"
                  title="Preview full size"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreview(img.key);
                  }}
                  className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-background/85 border opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="px-2 py-1.5 border-t bg-background">
                <p className="text-[11px] truncate" title={fileNameOf(img.key)}>
                  {fileNameOf(img.key)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {dims ? `${dims.width} × ${dims.height}` : "—"}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setPreview(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <ImageIcon className="w-4 h-4 mr-2" />
          Select Image
        </Button>
      </DialogTrigger>

      <DialogContent className="min-w-[70vw] max-w-4xl">
        <DialogHeader>
          <DialogTitle>Select or Upload Image</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-3 py-2 rounded-md">
            {error}
          </div>
        )}

        <div className="flex space-x-6 border-b border-border mt-1">
          {(
            [
              "event",
              "blog",
              "resource",
              "job",
              "certificate",
              "recording",
            ] as MediaAssetType[]
          ).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors capitalize flex items-center gap-1.5 ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-muted"
              }`}
            >
              {tab}
              {images[tab].length > 0 && (
                <span className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 font-normal">
                  {images[tab].length}
                </span>
              )}
            </button>
          ))}
        </div>

        <ScrollArea className="h-[45vh]">
          {renderGrid(images[activeTab])}
        </ScrollArea>

        <div className="mt-4 border-t pt-4 space-y-3">
          <p className="text-sm font-medium">
            Upload to{" "}
            <span className="text-primary capitalize">{activeTab}</span>
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`relative border-2 border-dashed rounded-lg transition-colors ${
              dragOver
                ? "border-primary bg-primary/5"
                : "border-border hover:border-primary/50"
            }`}
          >
            <label className="flex flex-col items-center gap-1.5 py-5 cursor-pointer">
              {uploading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">
                    Uploading…
                  </span>
                </>
              ) : (
                <>
                  <UploadCloud className="w-6 h-6 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Drag & drop or{" "}
                    <span className="text-primary font-medium underline underline-offset-2">
                      browse
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground/60">
                    PNG, JPG, WEBP, GIF supported
                  </span>
                </>
              )}
              <Input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  if (e.target.files?.[0]) handleUpload(e.target.files[0]);
                }}
              />
            </label>
          </div>
        </div>

        {preview && (
          <div
            className="absolute inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm rounded-lg"
            onClick={() => setPreview(null)}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {fileNameOf(preview)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {dimensions[preview]
                    ? `${dimensions[preview].width} × ${dimensions[preview].height}`
                    : "—"}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <Button
                  type="button"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePick(preview);
                  }}
                >
                  Use this image
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreview(null);
                  }}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>

            <div
              className="flex-1 flex items-center justify-center p-4 overflow-auto"
              style={checkerboard}
            >
              <img
                src={resolveStorageUrl(preview)}
                alt={preview}
                onLoad={(e) => handleImageLoad(preview, e)}
                onClick={(e) => e.stopPropagation()}
                className="max-w-full max-h-full object-contain"
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
