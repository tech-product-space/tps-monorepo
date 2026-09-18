"use client";

import React from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { PreviewRenderer } from "@/components/block-editor/preview/PreviewRenderer";
import { getLessonById } from "@/services/courses/lessons";
import { LESSON_CONTENT_VERSION, type ICourseLesson } from "@/types/course";

// Read-only, but still a full ProseMirror instance — keep it out of the lesson
// list's bundle; the dialog is only opened on demand.
const TiptapDocPreview = dynamic(
  () =>
    import("@/components/TiptapEditor/TiptapDocPreview").then(
      (m) => m.TiptapDocPreview,
    ),
  { ssr: false },
);

interface Props {
  // The lesson to preview; null closes the dialog. Only id/title/status are
  // needed up front — the full content is fetched fresh when opened.
  lesson: ICourseLesson | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LessonPreviewDialog({ lesson, open, onOpenChange }: Props) {
  const [loading, setLoading] = React.useState(false);
  // The whole record, because which of `content.blocks` / `content.doc` holds
  // the content depends on `content_version` — reading one of them and hoping
  // is what made every v2 lesson preview as empty.
  const [full, setFull] = React.useState<ICourseLesson | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open || !lesson) return;

    let active = true;
    setLoading(true);
    setError(null);
    setFull(null);

    getLessonById(lesson.id)
      .then((data) => {
        if (!active) return;
        setFull(data);
      })
      .catch(() => active && setError("Couldn't load this lesson."))
      .finally(() => active && setLoading(false));

    return () => {
      active = false;
    };
  }, [open, lesson]);

  const isTiptap = full?.content_version === LESSON_CONTENT_VERSION.TIPTAP;
  const doc = full?.content?.doc ?? null;
  const blocks: any[] = full?.content?.blocks ?? [];
  const isEmpty = isTiptap ? !doc : blocks.length === 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="truncate">{lesson?.title ?? "Lesson preview"}</span>
            {lesson && (
              <Badge
                variant={lesson.status === "published" ? "default" : "secondary"}
                className="text-[10px] uppercase"
              >
                {lesson.status}
              </Badge>
            )}
          </DialogTitle>
          <DialogDescription>
            This is how the lesson will appear to students.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading preview…
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm text-red-600">{error}</div>
        ) : isEmpty ? (
          <div className="py-16 text-center text-sm text-gray-400 italic">
            This lesson has no content yet.
          </div>
        ) : (
          // The same renderers the public lesson page uses, on the same dark
          // surface, so this preview is what students actually see.
          <div className="module-lesson-preview rounded-md border overflow-x-auto">
            {isTiptap ? (
              <TiptapDocPreview doc={doc} />
            ) : (
              blocks.map((b) => <PreviewRenderer key={b.id} block={b} />)
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
