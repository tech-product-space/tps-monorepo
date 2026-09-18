import React from "react";
import { Plus, Loader2, FileJson, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import Cookies from "js-cookie";

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";

import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";

import {
  getLessonsByModuleId,
  deleteLesson,
  reorderLessons,
  createLesson,
  updateAllLessonStatus,
  ICreateLessonPayload,
} from "@/services/courses/lessons";

import { SortableLessonItem } from "./SortableLessonItem";
import { LESSON_CONTENT_VERSION, type ICourseLesson } from "@/types/course";
import { LessonDialog } from "./LessonDialog";
import { LessonImportDialog } from "./LessonImportDialog";
import { LessonPreviewDialog } from "./LessonPreviewDialog";

import { useRouter } from "next/navigation";
interface Props {
  moduleId: string;
  // Needed to key imported images in S3 (written-course/{courseId}/…).
  courseId: string;
}

export function ModuleLessons({ moduleId, courseId }: Props) {
  const [lessons, setLessons] = React.useState<ICourseLesson[]>([]);
  const [loading, setLoading] = React.useState(false);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [previewLesson, setPreviewLesson] = React.useState<ICourseLesson | null>(
    null,
  );
  const [publishOpen, setPublishOpen] = React.useState(false);
  const [publishing, setPublishing] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  // Imported lessons land as drafts, so this is usually "everything just imported".
  const draftCount = lessons.filter((l) => l.status !== "published").length;

  // Simple in-memory cache for this component
  const cacheRef = React.useRef<Record<string, ICourseLesson[]>>({});

  const sensors = useSensors(useSensor(PointerSensor));

  const loadLessons = async (force = false) => {
    if (!force && cacheRef.current[moduleId]) {
      setLessons(cacheRef.current[moduleId]);
      return;
    }

    try {
      setLoading(true);
      const data = await getLessonsByModuleId(moduleId);
      cacheRef.current[moduleId] = data;
      setLessons(data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to load lessons");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadLessons();
  }, [moduleId]);

  const router = useRouter();
  const role = Cookies.get("currentRole");
  // The course and module ride along in the query string: the editor uses them
  // for its breadcrumbs and for the rail of sibling lessons, neither of which it
  // can derive from a lesson id alone.
  const handleEditLesson = (lesson: ICourseLesson) => {
    const params = new URLSearchParams({ course: courseId, module: moduleId });
    router.push(
      `/${role}/free-courses/modules/lessons/${lesson.id}?${params.toString()}`,
    );
  };

  const handleCreateLesson = async (data: ICreateLessonPayload) => {
    try {
      setSubmitting(true);
      // Everything created from here on is written in the Tiptap editor. Older
      // lessons keep their block content and their own editor.
      await createLesson(moduleId, {
        ...data,
        content_version: LESSON_CONTENT_VERSION.TIPTAP,
      });
      toast.success("Lesson created");

      setDialogOpen(false);
      await loadLessons(true);
    } catch {
      toast.error("Failed to create lesson");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePublishAll = async () => {
    try {
      setPublishing(true);
      const { message } = await updateAllLessonStatus(moduleId, "published");
      toast.success(message || "Lessons published");

      setPublishOpen(false);
      // force: the server changed rows this component's cache doesn't know about.
      await loadLessons(true);
    } catch {
      toast.error("Failed to publish lessons");
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async (lessonId: string) => {
    if (!confirm("Delete this lesson?")) return;

    try {
      await deleteLesson(lessonId);
      toast.success("Lesson deleted");

      const updated = lessons.filter((l) => l.id !== lessonId);
      setLessons(updated);
      cacheRef.current[moduleId] = updated;
    } catch {
      toast.error("Failed to delete lesson");
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = lessons.findIndex((l) => l.id === active.id);
    const newIndex = lessons.findIndex((l) => l.id === over.id);

    const newLessons = arrayMove(lessons, oldIndex, newIndex);

    setLessons(newLessons);
    cacheRef.current[moduleId] = newLessons;

    try {
      await reorderLessons(
        moduleId,
        newLessons.map((l) => l.id),
      );
      toast.success("Lessons reordered");
    } catch {
      toast.error("Failed to reorder lessons");
      loadLessons(true);
    }
  };

  return (
    <div className="bg-gray-50 border-t px-8 py-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <p className="text-xs text-gray-500 uppercase tracking-wider font-medium">
            Manage Lessons for this module
          </p>
          <span className="text-xs text-gray-400 bg-gray-200 rounded-full px-2 py-0.5">
            Total Lessons: {lessons.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 text-xs"
            disabled={draftCount === 0 || publishing}
            onClick={() => setPublishOpen(true)}
            title={
              draftCount === 0
                ? "Every lesson in this module is already published"
                : undefined
            }
          >
            {publishing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : (
              <Globe size={13} />
            )}
            Publish All{draftCount > 0 ? ` (${draftCount})` : ""}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={() => setImportOpen(true)}
          >
            <FileJson size={13} />
            Import Lessons
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-8 text-xs"
            onClick={() => setDialogOpen(true)}
          >
            <Plus size={13} />
            Add Lesson
          </Button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          Loading lessons
          <Loader2 size={14} className="animate-spin" />
        </div>
      )}

      {!loading && lessons.length === 0 && (
        <p className="text-sm text-gray-500">No lessons yet.</p>
      )}

      {!loading && lessons.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={lessons.map((l) => l.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {lessons.map((lesson) => (
                <SortableLessonItem
                  key={lesson.id}
                  lesson={lesson}
                  onEdit={handleEditLesson}
                  onDelete={handleDelete}
                  onPreview={setPreviewLesson}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <LessonDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreateLesson}
        loading={submitting}
        moduleId={moduleId}
      />

      <AlertDialog open={publishOpen} onOpenChange={setPublishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Publish {draftCount} {draftCount === 1 ? "lesson" : "lessons"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Every draft lesson in this module goes live on the public course
              page immediately. Lessons already published stay as they are.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog up while the request is in flight, so a slow
                // network can't look like a no-op and invite a second click.
                e.preventDefault();
                handlePublishAll();
              }}
              disabled={publishing}
            >
              {publishing ? "Publishing…" : "Publish all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <LessonImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        moduleId={moduleId}
        courseId={courseId}
        existingLessons={lessons}
        // force: the import bypassed cacheRef, and only the server knows the
        // ids and order it assigned.
        onImported={() => loadLessons(true)}
      />

      <LessonPreviewDialog
        lesson={previewLesson}
        open={previewLesson !== null}
        onOpenChange={(open) => !open && setPreviewLesson(null)}
      />
    </div>
  );
}
