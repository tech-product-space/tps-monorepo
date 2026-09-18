import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

export default function SortableColumnItem({
  id,
  label,
  visible,
  onToggle,
}: {
  id: string;
  label: string;
  visible: boolean;
  onToggle: () => void;
}) {
  const {
    setNodeRef,
    attributes,
    listeners,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        group flex items-center justify-between gap-3
        rounded-md px-3 py-2
        text-sm
        transition-colors
        ${isDragging ? "bg-muted shadow-sm" : "hover:bg-muted/70"}
      `}
    >
      {/* Left section: Drag + Label */}
      <div className="flex items-center gap-3 min-w-0">
        {/* Drag Handle */}
        <button
          {...attributes}
          {...listeners}
          className="
            flex h-6 w-6 items-center justify-center
            rounded-md
            text-muted-foreground
            hover:bg-muted
            cursor-grab
            active:cursor-grabbing
          "
          aria-label="Reorder column"
        >
          <GripVertical className="h-4 w-4" />
        </button>

        {/* Column Name */}
        <span className="truncate font-medium">{label}</span>
      </div>

      {/* Right section: Visibility toggle */}
      <Checkbox
        checked={visible}
        onCheckedChange={onToggle}
        aria-label={`Toggle ${label} column`}
      />
    </div>
  );
}
