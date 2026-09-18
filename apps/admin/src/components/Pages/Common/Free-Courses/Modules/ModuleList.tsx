import React, { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, BookOpen, FileJson } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CourseModule, CreateModulePayload } from "@/types/course";
import {
  getModulesByCourseId,
  createModule,
  updateModule,
  deleteModule,
  reorderModules,
} from "@/services/courses/modules";
import { SortableModuleItem } from "./SortableModuleItem";
import { ModuleDialog } from "./ModuleDialog";
import { ModuleImportDialog } from "./ModuleImportDialog";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";

interface ModuleListProps {
  courseId: string;
  modules: CourseModule[];
  onRefresh: () => void | Promise<void>;
}

export function ModuleList({
  courseId,
  modules: initialModules,
  onRefresh,
}: ModuleListProps) {
  const [modules, setModules] = useState<CourseModule[]>(initialModules);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedModule, setSelectedModule] = useState<CourseModule | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);

  // Sync with props when parent re-fetches
  useEffect(() => {
    setModules(initialModules);
  }, [initialModules]);

  const router = useRouter();
  const searchParams = useSearchParams();

  const openModuleId = searchParams.get("moduleId");
  const editedModuleId = searchParams.get("edited");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleCreateOrUpdate = async (data: CreateModulePayload) => {
    try {
      setSubmitting(true);
      if (selectedModule) {
        await updateModule(selectedModule.id, data);
        toast.success("Module updated successfully");
      } else {
        if (!courseId) {
          toast.error("Course ID is missing");
          return;
        }
        await createModule(courseId, data);
        toast.success("Module created successfully");
      }
      setDialogOpen(false);

      // Refresh parent state
      await onRefresh();
    } catch (error: any) {
      console.error("Failed to save module", error);
      const message = error?.response?.data?.message || "Failed to save module";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this module?")) return;
    try {
      await deleteModule(id);
      toast.success("Module deleted successfully");
      await onRefresh();
    } catch (error) {
      console.error("Failed to delete module", error);
      toast.error("Failed to delete module");
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = modules.findIndex((m) => m.id === active.id);
      const newIndex = modules.findIndex((m) => m.id === over.id);

      const newModules = arrayMove(modules, oldIndex, newIndex);
      setModules(newModules);

      try {
        await reorderModules(
          courseId,
          newModules.map((m) => m.id),
        );
        toast.success("Modules reordered");
      } catch (error) {
        console.error("Failed to reorder modules", error);
        toast.error("Failed to reorder modules");
        await onRefresh();
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Modules</h3>
          <p className="text-sm text-gray-500">
            Manage course modules and their order.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setImportOpen(true)}
            className="gap-2"
          >
            <FileJson size={18} />
            Import Modules
          </Button>
          <Button
            onClick={() => {
              setSelectedModule(null);
              setDialogOpen(true);
            }}
            className="gap-2 bg-blue-800 hover:bg-blue-900 disabled:opacity-70"
          >
            <Plus size={18} />
            Add Module
          </Button>
        </div>
      </div>

      {modules.length === 0 ? (
        <Card className="border-dashed border-2">
          <CardContent className="p-16 flex flex-col items-center justify-center text-gray-500">
            <BookOpen className="w-16 h-16 mb-4 opacity-10" />
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              No modules yet
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              Start building your course curriculum by adding your first module.
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setSelectedModule(null);
                  setDialogOpen(true);
                }}
                className="gap-2"
              >
                <Plus size={18} />
                Add First Module
              </Button>
              <Button
                variant="outline"
                onClick={() => setImportOpen(true)}
                className="gap-2"
              >
                <FileJson size={18} />
                Import Modules
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3 pb-12">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={modules.map((m) => m.id)}
              strategy={verticalListSortingStrategy}
            >
              {modules.map((module) => (
                <SortableModuleItem
                  key={module.id}
                  module={module}
                  isOpen={module.id === openModuleId}
                  isEdited={module.id === editedModuleId}
                  onOpen={() => {
                    const params = new URLSearchParams(searchParams.toString());
                    params.set("tab", "modules");
                    params.set("moduleId", module.id);

                    router.push(`?${params.toString()}`);
                  }}
                  onEdit={(m) => {
                    setSelectedModule(m);
                    setDialogOpen(true);

                    const params = new URLSearchParams(searchParams.toString());
                    params.set("tab", "modules");
                    params.set("moduleId", m.id);
                    params.set("edited", m.id);

                    router.push(`?${params.toString()}`);
                  }}
                  onDelete={handleDelete}
                  onRefresh={onRefresh}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>
      )}

      <ModuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleCreateOrUpdate}
        module={selectedModule}
        loading={submitting}
        courseId={courseId}
      />

      <ModuleImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        courseId={courseId}
        existingModules={modules}
        onImported={onRefresh}
      />
    </div>
  );
}
