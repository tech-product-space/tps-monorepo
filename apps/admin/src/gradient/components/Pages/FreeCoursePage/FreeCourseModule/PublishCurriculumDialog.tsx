"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import { Checkbox } from "@/gradient/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { freeCourseService } from "@/gradient/services/freeCourseService";
import { FreeCourseModule } from "@/gradient/types/freeCourse";

/**
 * Publish everything still in draft, in one pass.
 *
 * Replaces a dropdown-per-row workflow: eight modules of six lessons was
 * fifty-six menu-open-and-click cycles, each its own request. Here the whole
 * draft tree arrives pre-ticked, because "publish all of it" is what an admin
 * almost always means, and unticking is the rare case.
 *
 * **A ticked lesson forces its module ticked, and unticking a module unticks
 * its lessons.** Not a UI nicety — the public endpoints filter on the module's
 * `isPublished` as well as the lesson's (`getFreeCourseStructureBySlug`,
 * `getPublishedModulesByCourse`), so a published lesson inside a draft module
 * is invisible on the site. Letting that combination be picked would hand the
 * admin a silent no-op and a green toast saying it worked.
 */

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseIsPublished: boolean;
  modules: FreeCourseModule[];
  /**
   * Refetches the curriculum; the dialog does not patch state itself.
   *
   * `courseChanged` is reported separately because the editor deliberately does
   * *not* refetch the course — see the note where this is handled.
   */
  onDone: (result: { courseChanged: boolean }) => Promise<void> | void;
};

export default function PublishCurriculumDialog({
  open,
  onOpenChange,
  courseId,
  courseIsPublished,
  modules,
  onDone,
}: Props) {
  const [pickedModules, setPickedModules] = useState<Set<string>>(new Set());
  const [pickedLessons, setPickedLessons] = useState<Set<string>>(new Set());
  const [includeCourse, setIncludeCourse] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * Only drafts are listed — a published row has nothing to do here, and
   * showing it ticked-and-disabled would just be noise. A module that is
   * already live still appears as a heading when it has draft lessons under it,
   * because those lessons are the reason the admin opened this.
   */
  const draftTree = useMemo(
    () =>
      modules
        .map((m) => ({
          module: m,
          draftLessons: (m.lessons ?? []).filter((l) => !l.isPublished),
        }))
        .filter(
          ({ module, draftLessons }) =>
            !module.isPublished || draftLessons.length > 0,
        ),
    [modules],
  );

  const draftModuleCount = draftTree.filter((r) => !r.module.isPublished).length;
  const draftLessonCount = draftTree.reduce(
    (n, r) => n + r.draftLessons.length,
    0,
  );
  const total = draftModuleCount + draftLessonCount;

  // Re-tick everything each time it opens, so a cancelled run does not leave
  // last time's choices behind for the next one.
  useEffect(() => {
    if (!open) return;

    setPickedModules(
      new Set(
        draftTree.filter((r) => !r.module.isPublished).map((r) => r.module.id),
      ),
    );
    setPickedLessons(
      new Set(draftTree.flatMap((r) => r.draftLessons.map((l) => l.id))),
    );
    setIncludeCourse(!courseIsPublished);
  }, [open, draftTree, courseIsPublished]);

  const toggleModule = (
    moduleId: string,
    lessonIds: string[],
    next: boolean,
  ) => {
    setPickedModules((prev) => {
      const s = new Set(prev);
      if (next) s.add(moduleId);
      else s.delete(moduleId);
      return s;
    });

    // Unticking a module takes its lessons with it — they cannot go live
    // without it. Ticking it does not force them on: publishing a module while
    // holding one lesson back is a real thing to want.
    if (!next) {
      setPickedLessons((prev) => {
        const s = new Set(prev);
        lessonIds.forEach((id) => s.delete(id));
        return s;
      });
    }
  };

  const toggleLesson = (
    lessonId: string,
    moduleId: string,
    moduleIsDraft: boolean,
    next: boolean,
  ) => {
    setPickedLessons((prev) => {
      const s = new Set(prev);
      if (next) s.add(lessonId);
      else s.delete(lessonId);
      return s;
    });

    // A lesson cannot be visible unless its module is too.
    if (next && moduleIsDraft) {
      setPickedModules((prev) => new Set(prev).add(moduleId));
    }
  };

  const picked = pickedModules.size + pickedLessons.size;

  const submit = async () => {
    setSaving(true);
    try {
      const res = await freeCourseService.bulkPublishCurriculum(courseId, {
        isPublished: true,
        moduleIds: [...pickedModules],
        lessonIds: [...pickedLessons],
        includeCourse,
      });

      if (res.success) {
        toast.success(res.message);
        await onDone({ courseChanged: Boolean(res.data?.courseChanged) });
        onOpenChange(false);
      } else {
        toast.error(res.message || "Failed to publish");
      }
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "Failed to publish");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Publish curriculum</DialogTitle>
          <DialogDescription>
            {total === 0
              ? "Every module and lesson in this course is already published."
              : `${total} ${total === 1 ? "item is" : "items are"} still ${
                  total === 1 ? "a draft" : "drafts"
                }. Untick anything that is not ready.`}
          </DialogDescription>
        </DialogHeader>

        {/*
          A plain scrolling div rather than <ScrollArea>. Radix sizes its
          viewport with `height: 100%`, which cannot resolve against a parent
          that only has a `max-height` — and a fixed height would leave a tall
          empty box for a course with two drafts. `DialogContent` sets no height
          cap of its own, so without a scroller here a long curriculum grows the
          dialog past the bottom of the screen, taking the Publish button with
          it — on exactly the courses this dialog exists for.
        */}
        {total > 0 && (
          <div className="max-h-[45vh] overflow-y-auto pr-3">
            <div className="space-y-3">
              {draftTree.map(({ module, draftLessons }) => {
                const moduleIsDraft = !module.isPublished;
                const lessonIds = draftLessons.map((l) => l.id);

                return (
                  <div key={module.id} className="space-y-1.5">
                    <label className="flex items-start gap-2.5 text-sm font-medium">
                      {moduleIsDraft ? (
                        <Checkbox
                          checked={pickedModules.has(module.id)}
                          onCheckedChange={(v) =>
                            toggleModule(module.id, lessonIds, v === true)
                          }
                          className="mt-0.5"
                        />
                      ) : (
                        // Already live. Shown for context only, so the lessons
                        // beneath it are not floating unattached.
                        <span className="mt-0.5 w-4 shrink-0" />
                      )}

                      <span className="flex-1">
                        {module.title}
                        {!moduleIsDraft && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            already published
                          </span>
                        )}
                      </span>
                    </label>

                    {draftLessons.map((lesson) => (
                      <label
                        key={lesson.id}
                        className="ml-6 flex items-start gap-2.5 text-sm text-muted-foreground"
                      >
                        <Checkbox
                          checked={pickedLessons.has(lesson.id)}
                          onCheckedChange={(v) =>
                            toggleLesson(
                              lesson.id,
                              module.id,
                              moduleIsDraft,
                              v === true,
                            )
                          }
                          className="mt-0.5"
                        />
                        <span className="flex-1">{lesson.title}</span>
                      </label>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {!courseIsPublished && (
          <label className="flex items-start gap-2.5 rounded-md border bg-muted/40 p-3 text-sm">
            <Checkbox
              checked={includeCourse}
              onCheckedChange={(v) => setIncludeCourse(v === true)}
              className="mt-0.5"
            />
            <span>
              Also publish the course itself
              <span className="mt-0.5 block text-xs text-muted-foreground">
                The course is a draft, so none of this is reachable on the site
                until it is published.
              </span>
            </span>
          </label>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={saving || (picked === 0 && !includeCourse)}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {picked === 0 && includeCourse
              ? "Publish course"
              : `Publish ${picked} ${picked === 1 ? "item" : "items"}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
