"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import TiptapEditor, { TocItem } from "@/gradient/components/TiptapEditor/TiptapEditor";
// Shared with the project guide's step editor. Tiptap emits an update when it
// normalises stored JSON on load, and Postgres re-orders `jsonb` keys on the
// way out, so an untouched lesson has to be recognised structurally — comparing
// the serialised strings marks every lesson with a bold word as edited.
import { isSameContent } from "@/gradient/components/TiptapEditor/contentEquality";
import { lessonService } from "@/gradient/services/freeCourse/lesson/lesson.service";
import { FreeCourseLesson } from "@/gradient/types/freeCourse";

interface LessonContentPageProps {
  lesson: FreeCourseLesson;
  /** Lets the page around it save before switching lesson or leaving. */
  onRegister?: (api: { save: () => Promise<boolean> }) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSavingChange?: (saving: boolean) => void;
}

export default function LessonContentPage({
  lesson,
  onRegister,
  onDirtyChange,
  onSavingChange,
}: LessonContentPageProps) {
  const [editorData, setEditorData] = useState<{
    content: object;
    tableOfContents: TocItem[];
  } | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // What is on the server right now. Moves forward on every successful save.
  const savedContent = useRef<unknown>(lesson.content);

  const isDirty =
    editorData !== null &&
    !isSameContent(editorData.content, savedContent.current);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    onSavingChange?.(isSaving);
  }, [isSaving, onSavingChange]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!editorData || isSameContent(editorData.content, savedContent.current))
      return true;

    setIsSaving(true);
    const toastId = toast.loading("Saving content...");
    try {
      const res = await lessonService.updateLesson(lesson.id, {
        title: lesson.title,
        slug: lesson.slug,
        content: editorData.content,
        isPublished: lesson.isPublished,
        seo: lesson.seo,
      });

      if (res.success) {
        toast.success("Content saved successfully", { id: toastId });
        savedContent.current = editorData.content;
        // Re-evaluates isDirty against the new baseline.
        setEditorData({ ...editorData });
        return true;
      }

      toast.error("Failed to save content", { id: toastId });
      return false;
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "Failed to save content", {
        id: toastId,
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [editorData, lesson]);

  useEffect(() => {
    onRegister?.({ save: handleSave });
  }, [onRegister, handleSave]);

  return (
    /* The editor centres itself inside whatever width it is given, so the
       column is capped to its own max width — otherwise it drifts away from
       the lesson rail on a wide screen. Saving lives in the page toolbar; the
       editor's own toolbar is sticky and would sit on top of a button here. */
    <div className="max-w-[720px]">
      <TiptapEditor
        uploadId={lesson.id}
        uploadType="free-course"
        initialContent={lesson.content}
        onChange={setEditorData}
        stickyOffset={-24}
      />
    </div>
  );
}
