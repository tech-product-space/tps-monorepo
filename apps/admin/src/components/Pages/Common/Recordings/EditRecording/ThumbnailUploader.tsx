"use client";

import { useRef, useState } from "react";
import { AlertTriangle, ImageUp, Images, Loader2, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useNotification } from "@/helpers/NotificationContext";
import { uploadRecordingImage } from "@/services/recordings/recordingsService";
import ImagePickerDialog from "./ImagePickerDialog";

interface Props {
  value: string;
  onChange: (url: string) => void;
}

/** 16:9. Both pages crop to it, so anything else gets bars or a bad crop. */
const TARGET_RATIO = 16 / 9;
const RATIO_TOLERANCE = 0.08;

const RECOMMENDED = { width: 1280, height: 720 };
const MIN_WIDTH = 640;
const MAX_BYTES = 5 * 1024 * 1024;

const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

type Meta = { width: number; height: number; ratio: number };

const readImageMeta = (file: File) =>
  new Promise<Meta | null>((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        ratio: img.naturalWidth / img.naturalHeight,
      });
    };

    // A file the browser cannot decode is not something to block on — the upload
    // will fail on its own and say so.
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };

    img.src = url;
  });

/**
 * Direct upload for a recording's thumbnail.
 *
 * Dimensions are checked in the browser and reported as a **warning, not a
 * block** — a 15:9 image still renders, it just crops, and refusing the upload
 * over eight pixels would be worse than saying so.
 */
export default function ThumbnailUploader({ value, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { showNotification } = useNotification();

  const handleFile = async (file: File) => {
    if (!ACCEPTED.includes(file.type)) {
      showNotification("error", "Use a JPG, PNG or WebP image.");
      return;
    }

    if (file.size > MAX_BYTES) {
      showNotification(
        "error",
        `That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. Keep it under 5 MB.`
      );
      return;
    }

    const meta = await readImageMeta(file);
    const notes: string[] = [];

    if (meta) {
      if (Math.abs(meta.ratio - TARGET_RATIO) > RATIO_TOLERANCE) {
        notes.push(
          `This is ${meta.width}×${meta.height} (${meta.ratio.toFixed(2)}:1). The card is 16:9, so it will be cropped.`
        );
      }

      if (meta.width < MIN_WIDTH) {
        notes.push(
          `${meta.width}px wide is below ${MIN_WIDTH}px and will look soft on a large screen.`
        );
      }
    }

    setWarning(notes.length ? notes.join(" ") : null);
    setUploading(true);

    try {
      const url = await uploadRecordingImage(file);
      onChange(url);
      showNotification("success", "Thumbnail uploaded");
    } catch (error: any) {
      showNotification(
        "error",
        error?.response?.data?.message || "Upload failed. Try again."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      {value ? (
        <div className="space-y-3">
          <div className="relative w-full max-w-md overflow-hidden rounded-lg border border-gray-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="Thumbnail"
              className="aspect-video w-full object-cover"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ImageUp className="mr-2 h-4 w-4" />
              )}
              Replace
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setPickerOpen(true)}
            >
              <Images className="mr-2 h-4 w-4" />
              Library
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                onChange("");
                setWarning(null);
              }}
            >
              <Trash2 className="mr-2 h-4 w-4 text-red-600" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) =>
            (e.key === "Enter" || e.key === " ") && inputRef.current?.click()
          }
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          className={`flex aspect-video w-full max-w-md cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed transition-colors ${
            dragOver
              ? "border-blue-500 bg-blue-50"
              : "border-gray-300 hover:border-gray-400"
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              <p className="text-sm text-gray-500">Uploading…</p>
            </>
          ) : (
            <>
              <ImageUp className="h-8 w-8 text-gray-400" />
              <p className="text-sm font-medium text-gray-700">
                Drop an image, or click to choose
              </p>
              <p className="text-xs text-gray-500">
                16:9 · {RECOMMENDED.width}×{RECOMMENDED.height} recommended
              </p>
              <p className="text-xs text-gray-500">
                JPG, PNG or WebP · up to 5 MB
              </p>
            </>
          )}
        </div>
      )}

      {!value && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPickerOpen(true)}
        >
          <Images className="mr-2 h-4 w-4" />
          Choose from library
        </Button>
      )}

      {warning && (
        <p className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {warning}
        </p>
      )}

      <ImagePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={(url) => {
          onChange(url);
          // The 16:9 check reads a File before upload; a library image is
          // already in the bucket, so there is nothing left to measure and a
          // stale warning from the last upload would be misleading.
          setWarning(null);
        }}
      />

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          // Cleared so choosing the same file twice still fires onChange.
          e.target.value = "";
        }}
      />
    </div>
  );
}
