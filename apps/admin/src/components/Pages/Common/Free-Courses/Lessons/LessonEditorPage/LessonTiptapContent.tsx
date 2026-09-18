"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

import { uploadWrittenCourseFile } from "@/services/written-course/wrttenCourseService";
import type { TocItem } from "@/components/TiptapEditor/tocUtils";
import type { ICourseLesson } from "@/types/course";

// The editor reaches for `window` on load, and it is a large chunk that nothing
// outside the content tab needs.
const TiptapEditor = dynamic(
  () => import("@/components/TiptapEditor/TiptapEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center rounded-lg border p-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    ),
  },
);

interface Props {
  lesson: ICourseLesson;
  courseId: string;
  /** Lets the page around it save before switching lesson or leaving. */
  onRegister?: (api: { save: () => Promise<boolean> }) => void;
  onDirtyChange?: (dirty: boolean) => void;
  /** Persists the document. Resolves false when the write failed. */
  onSave: (doc: object) => Promise<boolean>;
}

/** A doc with nothing in it, however it happens to be spelled. */
const isEmptyContent = (content: unknown): boolean => {
  if (!content || typeof content !== "object") return true;

  const nodes = (content as { content?: unknown }).content;
  if (!Array.isArray(nodes) || nodes.length === 0) return true;

  return nodes.every(
    (node) =>
      node?.type === "paragraph" && (!node.content || node.content.length === 0),
  );
};

/**
 * Tiptap emits an update when it normalises stored JSON on load — an untouched
 * lesson would otherwise look edited, and every lesson switch would stop to ask
 * about changes that were never made. Compare the document instead of trusting
 * the event, and treat "empty" spellings as equal: a lesson saved with no
 * content at all comes back as `{}` while the editor renders one blank
 * paragraph.
 *
 * This handles the empty case; the normalisation case is handled by baselining
 * against what the editor actually read at load (`onReady`) rather than against
 * the stored JSON, since the two differ whenever the schema fills in a default.
 */
const isSameContent = (a: unknown, b: unknown): boolean => {
  if (isEmptyContent(a) && isEmptyContent(b)) return true;
  return JSON.stringify(a) === JSON.stringify(b);
};

export function LessonTiptapContent({
  lesson,
  courseId,
  onRegister,
  onDirtyChange,
  onSave,
}: Props) {
  const [editorData, setEditorData] = useState<{
    content: object;
    tableOfContents: TocItem[];
  } | null>(null);

  // The document to compare against — the stored one until the editor reports
  // how it actually parsed it, then that. Moves forward on every successful
  // save. A ref, not state: changing the baseline must not re-render the editor.
  const savedContent = useRef<unknown>(lesson.content?.doc ?? null);

  // Set once, by `onReady`, before any user input can have reached the editor.
  const handleReady = useCallback((doc: object) => {
    savedContent.current = doc;
  }, []);

  const isDirty =
    editorData !== null &&
    !isSameContent(editorData.content, savedContent.current);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  // Images dropped into a lesson belong to the course, not the blog folder.
  //
  // The API refuses an upload with no course id, and its 400 reaches the editor
  // as "Request failed with status code 400" — so both the missing id and the
  // server's own complaint are turned into something an author can act on.
  const uploadImage = useCallback(
    async (file: File) => {
      if (!courseId) {
        throw new Error(
          "This lesson could not be linked to its course, so there is nowhere to put the image. Reload the page and try again.",
        );
      }

      try {
        const res = await uploadWrittenCourseFile(file, courseId);
        return res.fileUrl as string;
      } catch (err: unknown) {
        const response = (err as { response?: { data?: { message?: string } } })
          .response;
        throw new Error(
          response?.data?.message ||
            (err instanceof Error ? err.message : "Image upload failed."),
        );
      }
    },
    [courseId],
  );

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!editorData || isSameContent(editorData.content, savedContent.current))
      return true;

    const ok = await onSave(editorData.content);
    if (!ok) return false;

    savedContent.current = editorData.content;
    // Re-evaluates isDirty against the new baseline.
    setEditorData({ ...editorData });
    return true;
  }, [editorData, onSave]);

  useEffect(() => {
    onRegister?.({ save: handleSave });
  }, [onRegister, handleSave]);

  // Read once, at creation — the editor does not re-read it, which is why the
  // page keys this component by lesson id.
  const initialContent = useMemo(
    () => lesson.content?.doc ?? undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <div className="mx-auto max-w-[860px]">
      <TiptapEditor
        initialContent={initialContent}
        onChange={setEditorData}
        onReady={handleReady}
        uploadImage={uploadImage}
      />
    </div>
  );
}
