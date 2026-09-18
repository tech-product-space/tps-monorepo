import React from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CourseModule } from "@/types/course";
import { updateModuleStatus } from "@/services/courses/modules";
import { toast } from "sonner";
import { ModuleLessons } from "../Lessons/ModuleLessons";

interface SortableModuleItemProps {
  module: CourseModule;
  onEdit: (module: CourseModule) => void;
  onDelete: (id: string) => void;
  onRefresh: () => void | Promise<void>;

  isOpen?: boolean;
  isEdited?: boolean;
  onOpen?: () => void;
}

export function SortableModuleItem({
  module,
  onEdit,
  onDelete,
  onRefresh,

  isOpen,
  isEdited,
  onOpen,
}: SortableModuleItemProps) {
  const [updatingStatus, setUpdatingStatus] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: module.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    opacity: isDragging ? 0.5 : 1,
  };

  const toggleStatus = async () => {
    if (updatingStatus) return;

    const newStatus = module.status === "published" ? "draft" : "published";

    try {
      setUpdatingStatus(true);
      await updateModuleStatus(module.id, newStatus);

      // optimistic update
      module.status = newStatus;

      toast.success(`Module marked as ${newStatus.toLowerCase()}`);

      // optional: sync parent
      await onRefresh();
    } catch {
      toast.error("Failed to update module status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-white border rounded-lg shadow-sm overflow-hidden"
    >
      {/* Module Header */}
      <div className="flex items-center gap-3 p-4 group">
        <button onClick={onOpen}>
          {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
        </button>

        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-gray-400"
        >
          <GripVertical size={18} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-semibold truncate">{module.title}</h4>

            <button
              type="button"
              onClick={toggleStatus}
              disabled={updatingStatus}
            >
              <Badge
                variant={
                  module.status === "published" ? "default" : "secondary"
                }
                className={`text-[10px] uppercase flex items-center gap-1 cursor-pointer ${updatingStatus ? "opacity-60 pointer-events-none" : ""
                  }`}
              >
                {updatingStatus && (
                  <Loader2 size={10} className="animate-spin" />
                )}
                {module.status}
              </Badge>
            </button>
          </div>

          {module.subtitle && (
            <p className="text-xs text-gray-500 truncate">{module.subtitle}</p>
          )}
        </div>

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="secondary"
            className="gap-1.5"
            onClick={() => onEdit(module)}
          >
            <Pencil size={14} />
            Edit Module
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onDelete(module.id)}
          >
            <Trash2 size={16} className="text-red-500" />
          </Button>
        </div>
      </div>

      {/* Lessons section */}
      {isOpen && (
        <ModuleLessons moduleId={module.id} courseId={module.course_id} />
      )}
    </div>
  );
}
