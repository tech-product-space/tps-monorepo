"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { blocksToDoc } from "@/components/TiptapEditor/convert/blocksToDoc";
import { updateLesson } from "@/services/courses/lessons";
import { LESSON_CONTENT_VERSION, type ICourseLesson } from "@/types/course";

const TiptapDocPreview = dynamic(
  () =>
    import("@/components/TiptapEditor/TiptapDocPreview").then(
      (m) => m.TiptapDocPreview,
    ),
  { ssr: false },
);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lesson: ICourseLesson;
  /** Called with the converted lesson once the write succeeds. */
  onConverted: (lesson: ICourseLesson) => void;
}

/**
 * Moves one lesson from the block builder to the Tiptap editor.
 *
 * The conversion is shown before it is written, because it is not lossless and
 * cannot be undone from the panel — `content.blocks` is replaced by
 * `content.doc`, and there is no converter back. The warnings list is the honest
 * part of this dialog; a lesson built out of cards and columns will come out
 * flatter than it went in, and the admin should see that before agreeing.
 */
export function ConvertToTiptapDialog({
  open,
  onOpenChange,
  lesson,
  onConverted,
}: Props) {
  const [saving, setSaving] = useState(false);

  const { doc, warnings } = useMemo(
    () => blocksToDoc(lesson.content?.blocks),
    [lesson.content?.blocks],
  );

  const handleConvert = async () => {
    try {
      setSaving(true);
      await updateLesson(lesson.id, {
        content: { doc },
        content_version: LESSON_CONTENT_VERSION.TIPTAP,
      });

      onConverted({
        ...lesson,
        content: { doc },
        content_version: LESSON_CONTENT_VERSION.TIPTAP,
      });
      toast.success("Lesson moved to the new editor");
      onOpenChange(false);
    } catch {
      toast.error("Failed to convert this lesson");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Switch to the new editor</DialogTitle>
          <DialogDescription>
            This rewrites the lesson&apos;s content in the new format. Check the
            preview below — once saved, it cannot be switched back.
          </DialogDescription>
        </DialogHeader>

        {warnings.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium text-amber-900">
              <AlertTriangle className="h-4 w-4" />
              What changes
            </p>
            <ul className="list-disc space-y-1 pl-5 text-xs text-amber-800">
              {warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Preview
          </p>
          {/* The dark surface the lesson player uses, so what is shown here is
              what the converted lesson will actually look like. */}
          <div className="module-lesson-preview rounded-md border">
            <TiptapDocPreview doc={doc} />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleConvert} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Converting...
              </>
            ) : (
              "Convert lesson"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
