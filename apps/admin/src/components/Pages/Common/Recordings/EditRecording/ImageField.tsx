"use client";

import { useState } from "react";
import { ImagePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import ImagePickerDialog from "./ImagePickerDialog";

interface Props {
  value?: string;
  onChange: (url: string) => void;
  /** Company logos are wide; avatars are round. */
  shape?: "circle" | "square";
  label?: string;
}

/**
 * The small image field: a speaker's photo, a host's avatar, a "previously at"
 * logo.
 *
 * Opens the recordings image library rather than a bare file input, because
 * these are the images that genuinely repeat — the same speaker across four
 * recordings, the same company logos behind three speakers. Uploading is still
 * one click away inside the dialog, for the first time an image is used.
 */
export default function ImageField({
  value,
  onChange,
  shape = "circle",
  label = "Choose image",
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="flex items-center gap-2">
      {value ? (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt=""
            className={
              shape === "circle"
                ? "h-10 w-10 rounded-full border border-gray-200 object-cover"
                : "h-10 w-20 rounded border border-gray-200 bg-white object-contain p-1"
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title="Remove"
            onClick={() => onChange("")}
          >
            <X className="h-4 w-4 text-red-600" />
          </Button>
        </div>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setPickerOpen(true)}
      >
        <ImagePlus className="mr-2 h-3.5 w-3.5" />
        {value ? "Replace" : label}
      </Button>

      <ImagePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onSelect={onChange}
      />
    </div>
  );
}
