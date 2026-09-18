"use client";

import React, { useState } from "react";
import {
  Trash2,
  Video as VideoIcon,
  Upload,
  Loader2,
  GripVertical,
  Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useDragHandle } from "./SortableBlock";
import {
  uploadWrittenCourseVideo,
  uploadWrittenCourseFile,
  deleteWrittenCourseFile,
} from "@/services/written-course/wrttenCourseService";
import { resolveStorageUrl } from "@/lib/stoage";

export function VideoBlock({ block, actions }: any) {
  const { setActivatorNodeRef, listeners, attributes } = useDragHandle();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isThumbnailUploading, setIsThumbnailUploading] = useState(false);
  const [isDraggingVideo, setIsDraggingVideo] = useState(false);
  const {
    sourceMode = "upload",
    key,
    src,
    thumbnailMode = "upload",
    thumbnailKey,
    thumbnail,
    alt,
    caption,
    credit,
    loop = false,
    autoplay = false,
    width = "100",
    alignment = "center",
    aspectRatio,
    maxHeight = 600,
  } = block.data;
  const courseId = actions.extraData?.courseId;

  const handleLoadedMetadata = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const video = e.currentTarget;
    if (!video.videoWidth || !video.videoHeight) return;
    const ratio = video.videoWidth / video.videoHeight;
    if (!aspectRatio || Math.abs(aspectRatio - ratio) > 0.01) {
      updateData({ aspectRatio: ratio });
    }
  };

  const resolvedThumbnailUrl =
    thumbnailMode === "upload"
      ? thumbnailKey
        ? resolveStorageUrl(thumbnailKey)
        : ""
      : thumbnail || "";

  const updateData = (updates: any) => actions.update(block.id, updates);

  const uploadVideoFile = async (file: File) => {
    if (!courseId) {
      alert("Course ID is required for upload. Please ensure the course is saved.");
      return;
    }
    if (!file.type.startsWith("video/")) {
      alert("Please drop a video file (MP4, WebM, etc.)");
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(0);
      const { key: uploadedKey } = await uploadWrittenCourseVideo(
        file,
        courseId,
        (pct) => setUploadProgress(pct),
      );

      updateData({ key: uploadedKey });
    } catch (error: any) {
      console.error("Video upload failed:", error);
      alert(error?.message || "Video upload failed");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadVideoFile(file);
    e.target.value = "";
  };

  const handleVideoDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingVideo(false);
    if (isUploading) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    await uploadVideoFile(file);
  };

  const handleVideoDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploading) setIsDraggingVideo(true);
  };

  const handleVideoDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingVideo(false);
  };

  const handleDeleteUploaded = async () => {
    if (courseId && key) {
      try {
        await deleteWrittenCourseFile(key);
      } catch (error) {
        console.error("Failed to delete video from server:", error);
      }
    }
    updateData({ key: "" });
  };

  const handleThumbnailFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!courseId) {
      alert("Course ID is required for upload. Please ensure the course is saved.");
      return;
    }

    try {
      setIsThumbnailUploading(true);

      if (thumbnailKey) {
        try {
          await deleteWrittenCourseFile(thumbnailKey);
        } catch (err) {
          console.error("Failed to delete previous thumbnail:", err);
        }
      }

      const response = await uploadWrittenCourseFile(file, courseId);
      const fileName = response.fileUrl.split("/").pop();
      const fullKey = `written-course/${courseId}/${fileName}`;
      updateData({ thumbnailKey: fullKey });
    } catch (error: any) {
      console.error("Thumbnail upload failed:", error);
      alert(error?.message || "Thumbnail upload failed");
    } finally {
      setIsThumbnailUploading(false);
      e.target.value = "";
    }
  };

  const handleDeleteThumbnail = async () => {
    if (thumbnailKey) {
      try {
        await deleteWrittenCourseFile(thumbnailKey);
      } catch (err) {
        console.error("Failed to delete thumbnail from server:", err);
      }
    }
    updateData({ thumbnailKey: "" });
  };

  const previewUrl = sourceMode === "upload" ? resolveStorageUrl(key) : src;

  const containerStyle: React.CSSProperties = {
    width: `${width}%`,
    maxWidth: aspectRatio ? `${maxHeight * aspectRatio}px` : undefined,
    margin:
      alignment === "center"
        ? "0 auto"
        : alignment === "right"
          ? "0 0 0 auto"
          : "0 auto 0 0",
  };

  const frameStyle: React.CSSProperties = {
    width: "100%",
    aspectRatio: aspectRatio ? String(aspectRatio) : undefined,
    background: "#000",
    borderRadius: 8,
    overflow: "hidden",
  };

  const videoFillStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "contain",
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
          <VideoIcon className="h-4 w-4" />
          Video
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
        {/* Source mode toggle */}
        <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
          <button
            type="button"
            onClick={() => updateData({ sourceMode: "upload" })}
            className={`flex items-center gap-1 px-3 py-1 text-xs rounded ${
              sourceMode === "upload"
                ? "bg-background shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            <Upload className="h-3 w-3" /> Upload
          </button>
          <button
            type="button"
            onClick={() => updateData({ sourceMode: "url" })}
            className={`flex items-center gap-1 px-3 py-1 text-xs rounded ${
              sourceMode === "url"
                ? "bg-background shadow-sm"
                : "text-muted-foreground"
            }`}
          >
            <LinkIcon className="h-3 w-3" /> URL
          </button>
        </div>

        {/* Source input */}
        {sourceMode === "upload" ? (
          !key ? (
            <div
              onDragOver={handleVideoDragOver}
              onDragEnter={handleVideoDragOver}
              onDragLeave={handleVideoDragLeave}
              onDrop={handleVideoDrop}
              className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg p-8 relative min-h-[200px] transition-colors ${
                isDraggingVideo
                  ? "border-primary bg-primary/10"
                  : "bg-muted/20"
              }`}
            >
              {isUploading ? (
                <div className="flex flex-col items-center gap-2 w-full max-w-xs">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Uploading video... {uploadProgress}%
                  </p>
                  <div className="w-full h-2 bg-muted rounded overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
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
                      MP4, WebM up to 500MB
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Recommended aspect ratio: <strong>16:9</strong> (e.g., 1920×1080)
                    </p>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept="video/*"
                    onChange={handleFileChange}
                  />
                </label>
              )}
            </div>
          ) : (
            <div className="relative group rounded-md overflow-hidden bg-muted p-4">
              <div style={containerStyle}>
                <div style={frameStyle}>
                  <video
                    key={`uploaded-${autoplay}-${loop}`}
                    src={previewUrl}
                    controls
                    autoPlay={autoplay}
                    loop={loop}
                    playsInline
                    poster={resolvedThumbnailUrl || undefined}
                    onLoadedMetadata={handleLoadedMetadata}
                    style={videoFillStyle}
                  />
                </div>
              </div>
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleDeleteUploaded}
                  className="h-8 text-xs gap-1 shadow-md bg-white/90 hover:bg-white text-black"
                >
                  <Trash2 className="h-3 w-3" /> Remove
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <div className="grid gap-1">
              <label className="text-[10px] font-medium uppercase text-muted-foreground px-1">
                Video URL (mp4)
              </label>
              <Input
                placeholder="https://.../video.mp4"
                value={src || ""}
                onChange={(e) => updateData({ src: e.target.value })}
                className="h-9 text-sm"
              />
              <p className="text-[10px] text-muted-foreground px-1">
                Recommended aspect ratio: <strong>16:9</strong> (e.g., 1920×1080)
              </p>
            </div>
            {src && (
              <div className="rounded-md overflow-hidden bg-muted p-4">
                <div style={containerStyle}>
                  <div style={frameStyle}>
                    <video
                      key={`url-${autoplay}-${loop}`}
                      src={src}
                      controls
                      autoPlay={autoplay}
                      loop={loop}
                      playsInline
                      poster={resolvedThumbnailUrl || undefined}
                      onLoadedMetadata={handleLoadedMetadata}
                      style={videoFillStyle}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Common settings */}
        <div className="grid gap-3">
          <div className="grid grid-cols-3 gap-3">
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
                Max height (px)
              </label>
              <Input
                type="number"
                min="100"
                max="2000"
                step="50"
                value={maxHeight}
                onChange={(e) =>
                  updateData({ maxHeight: Number(e.target.value) || 600 })
                }
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
          {aspectRatio && (() => {
            const target = 16 / 9;
            const isMatch = Math.abs(aspectRatio - target) < 0.05;
            const orientation =
              aspectRatio > 1.2
                ? "landscape"
                : aspectRatio < 0.85
                  ? "portrait"
                  : "square";
            return (
              <p
                className={`text-[10px] px-1 ${
                  isMatch ? "text-emerald-600" : "text-amber-600"
                }`}
              >
                Detected aspect ratio: {aspectRatio.toFixed(2)} ({orientation}){" "}
                {isMatch
                  ? "— matches recommended 16:9"
                  : "— outside recommended 16:9; layout may look unusual"}
              </p>
            );
          })()}

          <div className="grid gap-2">
            <div className="flex items-center justify-between px-1">
              <label className="text-[10px] font-medium uppercase text-muted-foreground">
                Thumbnail (optional)
              </label>
              <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
                <button
                  type="button"
                  onClick={() => updateData({ thumbnailMode: "upload" })}
                  className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded ${
                    thumbnailMode === "upload"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  <Upload className="h-3 w-3" /> Upload
                </button>
                <button
                  type="button"
                  onClick={() => updateData({ thumbnailMode: "url" })}
                  className={`flex items-center gap-1 px-2 py-0.5 text-[10px] rounded ${
                    thumbnailMode === "url"
                      ? "bg-background shadow-sm"
                      : "text-muted-foreground"
                  }`}
                >
                  <LinkIcon className="h-3 w-3" /> URL
                </button>
              </div>
            </div>

            {thumbnailMode === "upload" ? (
              !thumbnailKey ? (
                <div className="flex items-center justify-center border-2 border-dashed rounded-lg p-4 bg-muted/20 min-h-[100px]">
                  {isThumbnailUploading ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <p className="text-xs text-muted-foreground">
                        Uploading thumbnail...
                      </p>
                    </div>
                  ) : (
                    <label className="flex items-center gap-2 cursor-pointer text-xs">
                      <Upload className="h-4 w-4" />
                      <span>Click to upload thumbnail (PNG/JPG up to 1MB)</span>
                      <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handleThumbnailFileChange}
                      />
                    </label>
                  )}
                </div>
              ) : (
                <div className="relative group rounded-md overflow-hidden bg-muted p-2 w-fit">
                  <img
                    src={resolvedThumbnailUrl}
                    alt="Thumbnail preview"
                    className="max-h-32 rounded"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleDeleteThumbnail}
                    className="absolute top-1 right-1 h-7 text-[10px] gap-1 shadow-md bg-white/90 hover:bg-white text-black opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="h-3 w-3" /> Remove
                  </Button>
                </div>
              )
            ) : (
              <>
                <Input
                  placeholder="https://.../poster.jpg"
                  value={thumbnail || ""}
                  onChange={(e) => updateData({ thumbnail: e.target.value })}
                  className="h-9 text-sm"
                />
                {thumbnail && (
                  <div className="rounded-md overflow-hidden bg-muted p-2 w-fit">
                    <img
                      src={thumbnail}
                      alt="Thumbnail preview"
                      className="max-h-32 rounded"
                    />
                  </div>
                )}
              </>
            )}
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
