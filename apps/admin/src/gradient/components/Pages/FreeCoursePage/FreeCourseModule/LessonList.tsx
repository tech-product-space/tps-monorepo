"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Upload,
  Pencil,
  FileText,
  Trash2,
  MoreVertical,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

import { Button } from "@/gradient/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/gradient/components/ui/dropdown-menu";
import { Badge } from "@/gradient/components/ui/badge";
import { lessonService } from "@/gradient/services/freeCourse/lesson/lesson.service";
import { Lesson } from "@/gradient/types/freeCourse";
import LessonDialog from "./LessonDialog";
import LessonImportDialog from "./LessonImportDialog";

interface LessonListProps {
  courseId: string;
  moduleId: string;
  lessons: Lesson[];
  /** Lesson to flag after returning from the content editor. */
  highlightLessonId?: string | null;
  onLessonsChange: (lessons: Lesson[]) => void;
}

export default function LessonList({
  courseId,
  moduleId,
  lessons: rawLessons,
  highlightLessonId,
  onLessonsChange,
}: LessonListProps) {
  const router = useRouter();
  const [dialog, setDialog] = useState<
    { mode: "create" } | { mode: "edit"; lesson: Lesson } | null
  >(null);
  const [importOpen, setImportOpen] = useState(false);

  const lessons = [...rawLessons].sort((a, b) => a.order - b.order);

  // The content editor is a full page (Tiptap needs the room) — carry enough
  // context in the URL to come back to this exact spot.
  const contentHref = (lessonId: string) =>
    `/free-courses/lesson/edit/${lessonId}?course=${courseId}&module=${moduleId}`;

  const openContentEditor = (lessonId: string) => {
    router.push(contentHref(lessonId));
  };

  const handleDeleteLesson = async (id: string) => {
    if (!confirm("Are you sure you want to delete this lesson?")) return;
    try {
      const res = await lessonService.deleteLesson(id);
      if (res.success) {
        toast.success("Lesson deleted successfully");
        onLessonsChange(lessons.filter((l) => l.id !== id));
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "Failed to delete lesson");
    }
  };

  const handleToggleStatus = async (id: string) => {
    try {
      const res = await lessonService.toggleLessonStatus(id);
      if (res.success) {
        toast.success(res.message);
        onLessonsChange(
          lessons.map((l) =>
            l.id === id ? { ...l, isPublished: res.data.isPublished } : l,
          ),
        );
      }
    } catch (error: any) {
      console.error(error);
      toast.error("Failed to toggle status");
    }
  };

  const handleReorder = async (direction: "up" | "down", index: number) => {
    const newLessons = [...lessons];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newLessons.length) return;

    [newLessons[index], newLessons[targetIndex]] = [
      newLessons[targetIndex],
      newLessons[index],
    ];

    const reordered = newLessons.map((l, i) => ({ ...l, order: i }));
    onLessonsChange(reordered);

    try {
      await lessonService.reorderLessons(
        moduleId,
        reordered.map((l) => l.id),
      );
      toast.success("Order updated");
    } catch (error) {
      console.error(error);
      toast.error("Failed to update order");
      onLessonsChange(lessons);
    }
  };

  const handleSaved = (saved: any, isNew: boolean) => {
    if (isNew) {
      onLessonsChange([...lessons, saved]);
    } else {
      onLessonsChange(
        lessons.map((l) => (l.id === saved.id ? { ...l, ...saved } : l)),
      );
    }
  };

  return (
    <div className="space-y-4 pt-4 border-t mt-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Lessons ({lessons.length})
        </h4>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setImportOpen(true)}
          >
            <Upload className="mr-2 h-3 w-3" />
            Import Lessons
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDialog({ mode: "create" })}
          >
            <Plus className="mr-2 h-3 w-3" />
            Add Lesson
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        {lessons.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6 border border-dashed rounded-md">
            No lessons in this module.
          </p>
        ) : (
          lessons.map((lesson, index) => {
            const isHighlighted = lesson.id === highlightLessonId;
            return (
              <div
                key={lesson.id}
                className={`flex items-center justify-between p-3 rounded-md border transition-all group ${
                  isHighlighted
                    ? "bg-primary/5 border-primary/30 ring-1 ring-primary/10 shadow-sm"
                    : "bg-background border hover:border-primary/30"
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4"
                      disabled={index === 0}
                      onClick={() => handleReorder("up", index)}
                    >
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4"
                      disabled={index === lessons.length - 1}
                      onClick={() => handleReorder("down", index)}
                    >
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-medium ${isHighlighted ? "text-primary" : ""}`}
                      >
                        {lesson.title}
                      </span>
                      {lesson.isPublished ? (
                        <Badge className="h-4 px-1 text-[10px] bg-green-500/10 text-green-500 border-green-500/20">
                          Published
                        </Badge>
                      ) : (
                        <Badge
                          variant="secondary"
                          className="h-4 px-1 text-[10px]"
                        >
                          Draft
                        </Badge>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      Slug: {lesson.slug}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {/* A real link, so the unsaved-changes guard can intercept
                      it when the details tab has pending edits. */}
                  <Button asChild variant="ghost" size="sm" className="h-8 gap-1 text-xs">
                    <Link href={contentHref(lesson.id)}>
                      <FileText className="h-3.5 w-3.5" />
                      Content
                    </Link>
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    title="Edit lesson details"
                    onClick={() => setDialog({ mode: "edit", lesson })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>

                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => handleToggleStatus(lesson.id)}
                      >
                        {lesson.isPublished
                          ? "Move to Draft"
                          : "Publish Lesson"}
                      </DropdownMenuItem>

                      <DropdownMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => handleDeleteLesson(lesson.id)}
                      >
                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                        Delete Lesson
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })
        )}
      </div>

      {dialog && (
        <LessonDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          moduleId={moduleId}
          lesson={dialog.mode === "edit" ? dialog.lesson : undefined}
          onSaved={handleSaved}
          onEditContent={openContentEditor}
        />
      )}

      <LessonImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        moduleId={moduleId}
        courseId={courseId}
        existingLessons={lessons}
        onImported={(created) => onLessonsChange([...lessons, ...created])}
      />
    </div>
  );
}
