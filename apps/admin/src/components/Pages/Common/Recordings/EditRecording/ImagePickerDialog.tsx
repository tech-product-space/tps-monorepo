"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ImageIcon,
  Loader2,
  Maximize2,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import {
  LibraryImage,
  LibraryType,
  deleteLibraryImage,
  getLibraryImages,
  uploadRecordingImage,
} from "@/services/recordings/recordingsService";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (url: string) => void;
}

const TABS: { value: LibraryType; label: string }[] = [
  { value: "recordings", label: "Recordings" },
  { value: "events", label: "Events" },
  { value: "blogs", label: "Blogs" },
  { value: "ai-products", label: "AI Products" },
  { value: "projects", label: "Projects" },
];

// Checkerboard, so transparent PNGs and letterboxed images stay readable
// against the tile background instead of blending into it.
const checkerboard: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(45deg, rgba(0,0,0,0.05) 25%, transparent 25%), linear-gradient(-45deg, rgba(0,0,0,0.05) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(0,0,0,0.05) 75%), linear-gradient(-45deg, transparent 75%, rgba(0,0,0,0.05) 75%)",
  backgroundSize: "16px 16px",
  backgroundPosition: "0 0, 0 8px, 8px -8px, -8px 0px",
};

type Dimensions = { width: number; height: number };

type Cache = Partial<Record<LibraryType, LibraryImage[]>>;

/**
 * How many tiles render before "Show more".
 *
 * `blogs/` holds a thousand images. They all *load* — the search box has to see
 * every one of them, or it reports "no match" for a file that exists — but
 * mounting a thousand tiles at once makes opening the dialog visibly slow for a
 * grid nobody scrolls to the bottom of.
 */
const PAGE_SIZE = 120;

/**
 * Pick an image that has already been uploaded, or upload a new one.
 *
 * The library half is the point: a speaker appears in four recordings, the same
 * "previously at" logos come round again, and a speaker who has already been on
 * an event page has a photo in `events/` — which is why the tabs reach past this
 * feature's own folder rather than showing `recordings/` alone.
 *
 * New uploads always land in `recordings/`. The other tabs are read-only
 * sources: dropping a recording's thumbnail into `blogs/` because that tab
 * happened to be open is how folders stop meaning anything.
 */
export default function ImagePickerDialog({
  open,
  onOpenChange,
  onSelect,
}: Props) {
  const [activeTab, setActiveTab] = useState<LibraryType>("recordings");
  const [cache, setCache] = useState<Cache>({});
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [dimensions, setDimensions] = useState<Record<string, Dimensions>>({});
  const [preview, setPreview] = useState<LibraryImage | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [truncated, setTruncated] = useState<Partial<Record<LibraryType, boolean>>>({});
  const [shown, setShown] = useState(PAGE_SIZE);

  const images = cache[activeTab] ?? [];

  const fetchImages = useCallback(
    async (type: LibraryType, force = false) => {
      // Tabs are cached: flicking between them should not re-hit S3 each time.
      if (cache[type] && !force) return;

      setLoading(true);
      setError(null);

      try {
        const result = await getLibraryImages(type);
        setCache((prev) => ({ ...prev, [type]: result.files }));
        setTruncated((prev) => ({ ...prev, [type]: result.truncated }));
      } catch (err: any) {
        setError(
          err?.response?.data?.message ?? "Could not load the image library"
        );
      } finally {
        setLoading(false);
      }
    },
    [cache]
  );

  useEffect(() => {
    if (open) fetchImages(activeTab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeTab]);

  // A new tab or a new search starts at the top of a shorter list; keeping the
  // old cap would leave "Show more" hidden behind results it already covers.
  useEffect(() => setShown(PAGE_SIZE), [activeTab, q]);

  const handleUpload = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      setError("Only image files can go in the library.");
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const url = await uploadRecordingImage(file);
      // Straight out of the dialog: somebody who just chose a file has already
      // picked their image, and making them find it in the grid afterwards is
      // a step that exists only because the grid is there.
      onSelect(url);
      onOpenChange(false);
      // Dropped from the cache so the next open shows the new file.
      setCache((prev) => ({ ...prev, recordings: undefined }));
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (image: LibraryImage) => {
    setPendingDelete(image.key);
    setError(null);

    try {
      await deleteLibraryImage(image.key);
      setCache((prev) => ({
        ...prev,
        [activeTab]: (prev[activeTab] ?? []).filter(
          (item) => item.key !== image.key
        ),
      }));
      if (preview?.key === image.key) setPreview(null);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Could not delete that image");
    } finally {
      setPendingDelete(null);
    }
  };

  const handleImageLoad = (
    key: string,
    e: React.SyntheticEvent<HTMLImageElement>
  ) => {
    const { naturalWidth, naturalHeight } = e.currentTarget;
    if (!naturalWidth || !naturalHeight) return;

    setDimensions((prev) =>
      prev[key]
        ? prev
        : { ...prev, [key]: { width: naturalWidth, height: naturalHeight } }
    );
  };

  const pick = (image: LibraryImage) => {
    onSelect(image.url);
    setPreview(null);
    onOpenChange(false);
  };

  const needle = q.trim().toLowerCase();
  const matching = needle
    ? images.filter((image) => image.name.toLowerCase().includes(needle))
    : images;
  const visible = matching.slice(0, shown);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setPreview(null);
          setQ("");
        }
      }}
    >
      <DialogContent className="w-[95vw] min-w-0 max-w-4xl sm:min-w-[70vw]">
        <DialogHeader>
          <DialogTitle>Select or upload an image</DialogTitle>
        </DialogHeader>

        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-6 overflow-x-auto border-b border-gray-200">
          {TABS.map((tab) => {
            const count = cache[tab.value]?.length;
            const active = activeTab === tab.value;

            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => setActiveTab(tab.value)}
                className={`flex shrink-0 items-center gap-1.5 border-b-2 pb-3 text-sm font-medium transition-colors ${
                  active
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-900"
                }`}
              >
                {tab.label}
                {count !== undefined && count > 0 && (
                  <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-normal text-gray-600">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <Input
          className="mt-1"
          placeholder="Search by file name"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />

        <div className="h-[42vh] overflow-y-auto pr-1">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="text-sm">Loading images…</span>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-500">
              <ImageIcon className="h-8 w-8 opacity-30" />
              <span className="text-sm">
                {images.length === 0
                  ? "No images in this folder yet"
                  : "Nothing matches that search"}
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {visible.map((image) => {
                const dims = dimensions[image.key];

                return (
                  <div
                    key={image.key}
                    className="group overflow-hidden rounded-lg border border-gray-200 transition-all hover:border-blue-500 hover:shadow-sm"
                  >
                    <div
                      role="button"
                      tabIndex={0}
                      title={image.name}
                      onClick={() => pick(image)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          pick(image);
                        }
                      }}
                      className="relative flex aspect-square cursor-pointer items-center justify-center"
                      style={checkerboard}
                    >
                      {/* object-contain, never object-cover: this folder holds
                          wide banners, portrait headshots and square logos, and
                          cropping them all to a square hides which is which. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.url}
                        alt={image.name}
                        loading="lazy"
                        onLoad={(e) => handleImageLoad(image.key, e)}
                        className="max-h-full max-w-full object-contain"
                      />

                      <div className="absolute right-1.5 top-1.5 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <button
                          type="button"
                          title="Preview full size"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreview(image);
                          }}
                          className="rounded-md border border-gray-200 bg-white/90 p-1.5"
                        >
                          <Maximize2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          title="Delete from the bucket"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(image);
                          }}
                          className="rounded-md border border-gray-200 bg-white/90 p-1.5"
                        >
                          {pendingDelete === image.key ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-500" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-gray-100 bg-white px-2 py-1.5">
                      <p className="truncate text-[11px]" title={image.name}>
                        {image.name}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {dims ? `${dims.width} × ${dims.height}` : "—"} ·{" "}
                        {Math.max(1, Math.round(image.size / 1024))} KB
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {matching.length > visible.length && (
            <div className="mt-4 flex flex-col items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setShown((prev) => prev + PAGE_SIZE)}
              >
                Show more
              </Button>
              <span className="text-xs text-gray-500">
                Showing {visible.length} of {matching.length} — search finds the
                rest without scrolling.
              </span>
            </div>
          )}
        </div>

        {truncated[activeTab] && (
          <p className="text-xs text-amber-700">
            This folder holds more files than the panel will list. The oldest are
            not shown here.
          </p>
        )}

        <div className="space-y-2 border-t border-gray-200 pt-4">
          {/* Always "to recordings", whichever tab is open — see the note at the
              top of this file. */}
          <p className="text-sm font-medium text-gray-700">
            Upload to <span className="text-blue-600">recordings</span>
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleUpload(file);
            }}
            className={`rounded-lg border-2 border-dashed transition-colors ${
              dragOver
                ? "border-blue-500 bg-blue-50"
                : "border-gray-300 hover:border-blue-400"
            }`}
          >
            <label className="flex cursor-pointer flex-col items-center gap-1.5 py-5">
              {uploading ? (
                <>
                  <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                  <span className="text-sm text-gray-500">Uploading…</span>
                </>
              ) : (
                <>
                  <UploadCloud className="h-6 w-6 text-gray-400" />
                  <span className="text-sm text-gray-600">
                    Drag &amp; drop, or{" "}
                    <span className="font-medium text-blue-600 underline underline-offset-2">
                      browse
                    </span>
                  </span>
                  <span className="text-xs text-gray-400">
                    PNG, JPG, WEBP, GIF, SVG
                  </span>
                </>
              )}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleUpload(file);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>

        {/* Full-size preview. Inside the dialog rather than as a second one:
            a dialog on a dialog closes both when you press Escape. */}
        {preview && (
          <div
            className="absolute inset-0 z-50 flex flex-col rounded-lg bg-white/95 backdrop-blur-sm"
            onClick={() => setPreview(null)}
          >
            <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{preview.name}</p>
                <p className="text-xs text-gray-500">
                  {dimensions[preview.key]
                    ? `${dimensions[preview.key].width} × ${dimensions[preview.key].height}`
                    : "—"}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    pick(preview);
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
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div
              className="flex flex-1 items-center justify-center overflow-auto p-4"
              style={checkerboard}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt={preview.name}
                onLoad={(e) => handleImageLoad(preview.key, e)}
                onClick={(e) => e.stopPropagation()}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
