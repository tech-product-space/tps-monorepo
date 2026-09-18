"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Plus,
  Upload,
  Edit,
  Trash2,
  Globe,
  Lock,
  MoreVertical,
  ArrowUp,
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Rocket,
} from "lucide-react";

import { Button } from "@/gradient/components/ui/button";
import { Card, CardContent } from "@/gradient/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/gradient/components/ui/dropdown-menu";
import { freeCourseService } from "@/gradient/services/freeCourseService";
import ModuleForm, {
  ModuleFormValues,
} from "@/gradient/components/Pages/FreeCoursePage/FreeCourseModule/ModuleForm";
import { Badge } from "@/gradient/components/ui/badge";
import { SampleImagePreview } from "@/gradient/components/Common/SampleImagePreview";
import LessonList from "@/gradient/components/Pages/FreeCoursePage/FreeCourseModule/LessonList";
import ModuleImportDialog from "@/gradient/components/Pages/FreeCoursePage/FreeCourseModule/ModuleImportDialog";
import PublishCurriculumDialog from "@/gradient/components/Pages/FreeCoursePage/FreeCourseModule/PublishCurriculumDialog";

import { FreeCourseModule } from "@/gradient/types/freeCourse";

interface FreeCourseModulePageProps {
  modules: FreeCourseModule[];
  courseId: string;
  /** Drives the "also publish the course" option in the publish dialog. */
  courseIsPublished: boolean;
  onModulesChange: (modules: FreeCourseModule[]) => void;
  onRefetch: () => Promise<void> | void;
}

export default function FreeCourseModulePage({
  modules: rawModules,
  courseId,
  courseIsPublished,
  onModulesChange,
  onRefetch,
}: FreeCourseModulePageProps) {
  const searchParams = useSearchParams();

  const modules = [...rawModules].sort((a, b) => a.order - b.order);

  // Coming back from the lesson content editor carries the module to reopen
  // and the lesson to highlight, so the list is restored exactly as it was.
  const focusedModuleId = searchParams.get("module");
  const focusedLessonId = searchParams.get("lesson");

  const [moduleDialog, setModuleDialog] = useState<
    { mode: "create" } | { mode: "edit"; module: FreeCourseModule } | null
  >(null);
  // Arriving with ?module= (from the content editor, or a deep link) opens
  // that module straight away.
  const [expandedModules, setExpandedModules] = useState<
    Record<string, boolean>
  >(() => (focusedModuleId ? { [focusedModuleId]: true } : {}));
  const [importOpen, setImportOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);

  /**
   * Set when the publish dialog also published the course itself.
   *
   * The course is *not* refetched, and its object in the editor is not patched
   * either — `FreeCourseForm` calls `reset(...)` from an effect keyed on
   * `initialValues`, so handing the editor a new course object from here would
   * silently wipe whatever the admin had typed on the Course Details tab and
   * not yet saved. This flag carries the one field the dialog needs to know
   * about, without touching the object that would trigger that.
   */
  const [coursePublishedHere, setCoursePublishedHere] = useState(false);

  useEffect(() => {
    // Back from the content editor: the lesson may have been renamed or
    // published there, so pull fresh data rather than trusting the first load.
    if (focusedLessonId) void onRefetch();
  }, [focusedLessonId, onRefetch]);

  const toggleExpand = (moduleId: string) => {
    setExpandedModules((prev) => ({ ...prev, [moduleId]: !prev[moduleId] }));
  };

  const setModules = useCallback(
    (next: FreeCourseModule[]) => onModulesChange(next),
    [onModulesChange],
  );

  const handleCreateModule = async (values: ModuleFormValues) => {
    try {
      const res = await freeCourseService.createModule(courseId, values);
      if (res.success) {
        toast.success("Module created successfully");
        setModules([...modules, res.data]);
        setModuleDialog(null);
        // Drop straight into the new module so lessons can be added.
        setExpandedModules((prev) => ({ ...prev, [res.data.id]: true }));
      } else {
        toast.error("Failed to create module");
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "Failed to create module");
    }
  };

  const handleUpdateModule = async (values: ModuleFormValues) => {
    if (moduleDialog?.mode !== "edit") return;
    const editingModule = moduleDialog.module;
    try {
      const res = await freeCourseService.updateModule(
        editingModule.id,
        values,
      );
      if (res.success) {
        toast.success("Module updated successfully");
        setModules(
          modules.map((m) =>
            m.id === editingModule.id ? { ...m, ...res.data } : m,
          ),
        );
        setModuleDialog(null);
      } else {
        toast.error("Failed to update module");
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "Failed to update module");
    }
  };

  const handleDeleteModule = async (id: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this module? All lessons within it will also be lost.",
      )
    )
      return;
    try {
      const res = await freeCourseService.deleteModule(id);
      if (res.success) {
        toast.success("Module deleted successfully");
        setModules(modules.filter((m) => m.id !== id));
      } else {
        toast.error("Failed to delete module");
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "Failed to delete module");
    }
  };

  const handleToggleStatus = async (id: string) => {
    try {
      const res = await freeCourseService.toggleModuleStatus(id);
      if (res.success) {
        toast.success(res.message);
        setModules(
          modules.map((m) =>
            m.id === id ? { ...m, isPublished: res.data.isPublished } : m,
          ),
        );
      }
    } catch (error: any) {
      console.error(error);
      toast.error("Failed to toggle status");
    }
  };

  // "Publish with all lessons" — the narrow case the dialog is overkill for.
  //
  // Sends the module and its draft lessons together rather than looping the
  // single toggle, so it is one request and one activity row. A lesson already
  // published is left out: including it would be a no-op write and would
  // inflate the count reported back.
  const handlePublishModuleTree = async (module: FreeCourseModule) => {
    const lessonIds = (module.lessons ?? [])
      .filter((l) => !l.isPublished)
      .map((l) => l.id);

    try {
      const res = await freeCourseService.bulkPublishCurriculum(courseId, {
        isPublished: true,
        moduleIds: module.isPublished ? [] : [module.id],
        lessonIds,
      });

      if (res.success) {
        toast.success(res.message);
        await onRefetch();
      } else {
        toast.error(res.message || "Failed to publish");
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "Failed to publish");
    }
  };

  const handleReorder = async (direction: "up" | "down", index: number) => {
    const newModules = [...modules];
    const targetIndex = direction === "up" ? index - 1 : index + 1;

    if (targetIndex < 0 || targetIndex >= newModules.length) return;

    [newModules[index], newModules[targetIndex]] = [
      newModules[targetIndex],
      newModules[index],
    ];

    // Optimistic update — rewrite `order` so the local sort matches the server.
    const reordered = newModules.map((m, i) => ({ ...m, order: i }));
    setModules(reordered);

    try {
      const moduleIds = reordered.map((m) => m.id);
      const res = await freeCourseService.reorderModules(courseId, moduleIds);
      if (res.success) {
        toast.success("Order updated");
      } else {
        toast.error("Failed to update order");
        setModules(modules);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to update order");
      setModules(modules);
    }
  };

  // Drafts across the whole curriculum. Drives the toolbar button, which stays
  // hidden at zero — an admin with nothing left to publish should not be
  // offered a dialog that opens onto "everything is already published".
  const draftCount = modules.reduce(
    (n, m) =>
      n +
      (m.isPublished ? 0 : 1) +
      (m.lessons ?? []).filter((l) => !l.isPublished).length,
    0,
  );

  const handleLessonsChange = (moduleId: string, lessons: any[]) => {
    setModules(
      modules.map((m) => (m.id === moduleId ? { ...m, lessons } : m)),
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold">Modules ({modules.length})</h2>

          <SampleImagePreview
            imagePath="/free-course/module-detail.png"
            title="Free Course Detail Page Modules Section"
          />
        </div>
        <div className="flex items-center gap-2">
          {draftCount > 0 && (
            <Button variant="outline" onClick={() => setPublishOpen(true)}>
              <Rocket className="mr-2 h-4 w-4" />
              Publish ({draftCount})
            </Button>
          )}
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import Modules
          </Button>
          <Button onClick={() => setModuleDialog({ mode: "create" })}>
            <Plus className="mr-2 h-4 w-4" />
            Add Module
          </Button>
        </div>
      </div>

      <div className="grid gap-4">
        {modules.length === 0 ? (
          <Card>
            <CardContent className="p-10 text-center">
              <p className="text-muted-foreground">
                No modules found for this course. Click &quot;Add Module&quot;
                to get started.
              </p>
            </CardContent>
          </Card>
        ) : (
          modules.map((module, index) => (
            <Card
              key={module.id}
              className={`group hover:border-primary/50 transition-all ${expandedModules[module.id] ? "border-primary ring-1 ring-primary/20 shadow-lg" : ""}`}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center justify-center pr-2 border-r mr-2 cursor-pointer">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={index === 0}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReorder("up", index);
                        }}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={index === modules.length - 1}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReorder("down", index);
                        }}
                      >
                        <ArrowDown className="h-4 w-4" />
                      </Button>
                    </div>
                    <div
                      className="flex flex-col cursor-pointer flex-1"
                      onClick={() => toggleExpand(module.id)}
                    >
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{module.title}</h3>
                        {module.isPublished ? (
                          <Badge
                            variant="default"
                            className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20"
                          >
                            <Globe className="mr-1 h-3 w-3" /> Published
                          </Badge>
                        ) : (
                          <Badge variant="secondary">
                            <Lock className="mr-1 h-3 w-3" /> Draft
                          </Badge>
                        )}
                      </div>
                      {module.subTitle && (
                        <p className="text-sm text-muted-foreground">
                          {module.subTitle}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        Slug: {module.slug}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleExpand(module.id)}
                      className="text-muted-foreground hover:text-primary gap-1"
                    >
                      {expandedModules[module.id] ? (
                        <>
                          <ChevronUp className="h-4 w-4" />
                          Hide Lessons ({module.lessons?.length || 0})
                        </>
                      ) : (
                        <>
                          <ChevronDown className="h-4 w-4" />
                          View Lessons ({module.lessons?.length || 0})
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Edit module"
                      onClick={() =>
                        setModuleDialog({ mode: "edit", module })
                      }
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-[240px]">
                        <DropdownMenuItem
                          onClick={() => handleToggleStatus(module.id)}
                        >
                          {module.isPublished
                            ? "Move to Draft"
                            : "Publish Module"}
                        </DropdownMenuItem>
                        {(module.lessons ?? []).some((l) => !l.isPublished) && (
                          <DropdownMenuItem
                            onClick={() =>
                              void handlePublishModuleTree(module)
                            }
                          >
                            <Rocket className="mr-2 h-4 w-4" />
                            Publish with all lessons
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => handleDeleteModule(module.id)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Module
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {expandedModules[module.id] && (
                  <div className="animate-in slide-in-from-top-2 duration-300">
                    <LessonList
                      courseId={courseId}
                      moduleId={module.id}
                      lessons={module.lessons || []}
                      highlightLessonId={
                        focusedModuleId === module.id ? focusedLessonId : null
                      }
                      onLessonsChange={(lessons) =>
                        handleLessonsChange(module.id, lessons)
                      }
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Dialog
        open={moduleDialog !== null}
        onOpenChange={(open) => {
          if (!open) setModuleDialog(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {moduleDialog?.mode === "edit"
                ? `Edit Module: ${moduleDialog.module.title}`
                : "Add New Module"}
            </DialogTitle>
            <DialogDescription>
              {moduleDialog?.mode === "edit"
                ? "Update the module details. Lessons stay untouched."
                : "Create a module, then add lessons to it."}
            </DialogDescription>
          </DialogHeader>

          {moduleDialog && (
            <ModuleForm
              bare
              courseId={courseId}
              initialValues={
                moduleDialog.mode === "edit" ? moduleDialog.module : undefined
              }
              onSubmit={
                moduleDialog.mode === "edit"
                  ? handleUpdateModule
                  : handleCreateModule
              }
              onCancel={() => setModuleDialog(null)}
              submitLabel={
                moduleDialog.mode === "edit" ? "Update Module" : "Create Module"
              }
              loadingLabel={
                moduleDialog.mode === "edit" ? "Updating..." : "Creating..."
              }
            />
          )}
        </DialogContent>
      </Dialog>

      <ModuleImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        courseId={courseId}
        existingModules={modules}
        onImported={onRefetch}
      />

      <PublishCurriculumDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        courseId={courseId}
        courseIsPublished={courseIsPublished || coursePublishedHere}
        modules={modules}
        onDone={async ({ courseChanged }) => {
          if (courseChanged) setCoursePublishedHere(true);
          await onRefetch();
        }}
      />
    </div>
  );
}
