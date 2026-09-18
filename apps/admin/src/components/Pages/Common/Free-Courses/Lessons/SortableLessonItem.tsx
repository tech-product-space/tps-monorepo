import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Trash2, Loader2, Pencil, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

import type { ICourseLesson } from "@/types/course";
import { updateLessonStatus } from "@/services/courses/lessons";

interface Props {
  lesson: ICourseLesson;
  onDelete: (id: string) => void;
  onEdit: (lesson: ICourseLesson) => void;
  onPreview: (lesson: ICourseLesson) => void;
}

export function SortableLessonItem({ lesson, onDelete, onEdit, onPreview }: Props) {
  const { setNodeRef, attributes, listeners, transform, transition } =
    useSortable({ id: lesson.id });

  const [updating, setUpdating] = React.useState(false);

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const toggleStatus = async () => {
    if (updating) return;

    const newStatus = lesson.status === "published" ? "draft" : "published";

    try {
      setUpdating(true);
      await updateLessonStatus(lesson.id, newStatus);
      toast.success(`Lesson marked as ${newStatus}`);
      lesson.status = newStatus; // local optimistic update
    } catch {
      toast.error("Failed to update lesson status");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between group p-2 bg-white border rounded"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          {...attributes}
          {...listeners}
          className="cursor-grab text-gray-400"
        >
          <GripVertical size={16} />
        </span>

        <span className="text-sm truncate font-semibold">{lesson.title}</span>

        <button
          type="button"
          onClick={toggleStatus}
          disabled={updating}
          className="ml-2"
        >
          <Badge
            variant={lesson.status === "published" ? "default" : "secondary"}
            className={`text-[10px] uppercase flex items-center gap-1 cursor-pointer ${updating ? "opacity-60 pointer-events-none" : ""
              }`}
          >
            {updating && <Loader2 size={10} className="animate-spin" />}
            {lesson.status}
          </Badge>
        </button>
      </div>

      <div className="flex items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          title="Preview lesson"
          onClick={() => onPreview(lesson)}
        >
          <Eye size={14} />
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="gap-1.5"
          onClick={() => onEdit(lesson)}
        >
          <Pencil size={14} />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => onDelete(lesson.id)}>
          <Trash2 className="text-red-500" size={14} />
        </Button>
      </div>

    </div>
  );
}
