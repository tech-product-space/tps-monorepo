"use client";

import dynamic from "next/dynamic";

import { PreviewRenderer } from "@/components/block-editor/preview/PreviewRenderer";
import { IBlockBase } from "@/components/block-editor/types/block.types";
import { LESSON_CONTENT_VERSION, ICourseLesson } from "@/types/course";

// Read-only, but still a full ProseMirror instance — keep it off the server and
// out of the initial bundle.
const TiptapDocPreview = dynamic(
  () =>
    import("@/components/TiptapEditor/TiptapDocPreview").then(
      (m) => m.TiptapDocPreview,
    ),
  { ssr: false },
);

export function LessonPreviewTab({ lesson }: { lesson: ICourseLesson }) {
  if (lesson.content_version === LESSON_CONTENT_VERSION.TIPTAP) {
    const doc = lesson.content?.doc ?? null;

    if (!doc) {
      return (
        <p className="text-sm text-muted-foreground">
          Nothing written yet. Anything you add on the Content tab shows up here
          once it is saved.
        </p>
      );
    }

    // Same dark surface the block preview uses, so this tab shows a v2 lesson
    // the way the player will rather than the way the editor does.
    return (
      <div className="module-lesson-preview">
        <TiptapDocPreview doc={doc} />
      </div>
    );
  }

  const blocks = (lesson.content?.blocks as IBlockBase[]) || [];

  return (
    <div className="module-lesson-preview">
      {blocks.map((block) => (
        <PreviewRenderer key={block.id} block={block} />
      ))}
    </div>
  );
}
