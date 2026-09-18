"use client";

import React, { useRef, useState } from "react";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  isVideoUrl,
  resolveAssetUrl,
  toYouTubeEmbed,
  uploadAiProductImage,
} from "@/services/ai-products/aiProductService";

type Props = {
  label?: string;
  value: string;
  onChange: (url: string) => void;
  placeholder?: string;
  /** Suggested dimensions shown under the field, e.g. "1280×720px (16:9)" */
  hint?: string;
  /** File-picker filter; default images only */
  accept?: string;
  previewClassName?: string;
};

// URL/key input + S3 upload button + live preview. Accepts pasted absolute
// URLs (e.g. YouTube) or uploads a file via POST /upload/ai-products, in
// which case only the S3 key is stored. Previews images, video files and
// YouTube links.
export default function ImageUploadField({
  label,
  value,
  onChange,
  placeholder = "Paste URL or upload",
  hint,
  accept = "image/*",
  previewClassName = "h-24 rounded border object-cover",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setUploading(true);
      const key = await uploadAiProductImage(file);
      onChange(key);
      toast.success("File uploaded");
    } catch {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const resolved = resolveAssetUrl(value);
  const youTubeEmbed = value ? toYouTubeEmbed(value) : null;
  const isVideo = value ? isVideoUrl(value) : false;

  return (
    <div className="space-y-1.5">
      {label && <Label>{label}</Label>}
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          title="Upload file"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
        </Button>
        {value && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => onChange("")}
            title="Clear"
          >
            <X size={16} />
          </Button>
        )}
      </div>

      {hint && <p className="text-xs text-gray-500">Suggested: {hint}</p>}

      {/* Preview */}
      {value && (
        youTubeEmbed ? (
          <iframe
            src={youTubeEmbed}
            title="Video preview"
            className="w-full aspect-video rounded border"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        ) : isVideo ? (
          <video
            controls
            src={resolved}
            className="w-full max-h-64 rounded border bg-black"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={resolved} alt="" className={previewClassName} />
        )
      )}
    </div>
  );
}
