import React, { useState } from "react";
import { Eye, X } from "lucide-react";

interface SampleImagePreviewProps {
  imagePath: string;
  title: string;
}

export function SampleImagePreview({
  imagePath,
  title,
}: SampleImagePreviewProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 text-primary text-sm font-medium hover:bg-primary/5 transition-colors"
      >
        <Eye className="h-4 w-4" />
        View Sample
      </button>

      {/* Fullscreen Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-6"
          onClick={() => setOpen(false)}
        >
          {/* Card */}
          <div
            className="bg-white rounded-md overflow-hidden shadow-2xl w-full max-w-5xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-8 py-5 border-b">
              <span className="text-xl font-semibold text-slate-800">
                {title}
              </span>

              <button
                onClick={() => setOpen(false)}
                className="p-2 rounded-full hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Image */}
            <div className="overflow-auto bg-slate-50 p-8 flex justify-center">
              <img
                src={imagePath}
                alt={`${title} Sample`}
                className="w-full h-auto max-h-[70vh] object-contain rounded-md"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
