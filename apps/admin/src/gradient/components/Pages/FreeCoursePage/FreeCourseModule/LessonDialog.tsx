"use client";

import { useEffect, useState } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Check, Loader2, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { Switch } from "@/gradient/components/ui/switch";
import { Textarea } from "@/gradient/components/ui/textarea";
import { lessonService } from "@/gradient/services/freeCourse/lesson/lesson.service";
import { Lesson } from "@/gradient/types/freeCourse";
import { useSlugAvailability } from "@/gradient/hooks/useSlugAvailability";

const lessonSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required"),
  isPublished: z.boolean(),
  seo: z.object({
    metaTitle: z.string(),
    metaDescription: z.string(),
    metaKeywords: z.string(),
  }),
});

type LessonDialogValues = z.infer<typeof lessonSchema>;

interface LessonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleId: string;
  /** Omit to create a new lesson. */
  lesson?: Lesson & { seo?: any };
  onSaved: (lesson: any, isNew: boolean) => void;
  /** Offered after saving so long-form content is one click away. */
  onEditContent?: (lessonId: string) => void;
}

export default function LessonDialog({
  open,
  onOpenChange,
  moduleId,
  lesson,
  onSaved,
  onEditContent,
}: LessonDialogProps) {
  const isNew = !lesson;

  // The module list only carries id/title/slug/order/isPublished, so the full
  // record is loaded before editing — otherwise saving would blank out SEO.
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LessonDialogValues>({
    resolver: zodResolver(lessonSchema) as Resolver<LessonDialogValues>,
    defaultValues: {
      title: "",
      slug: "",
      isPublished: false,
      seo: { metaTitle: "", metaDescription: "", metaKeywords: "" },
    },
  });

  useEffect(() => {
    if (!open) return;

    if (isNew) {
      reset({
        title: "",
        slug: "",
        isPublished: false,
        seo: { metaTitle: "", metaDescription: "", metaKeywords: "" },
      });
      return;
    }

    let cancelled = false;
    const loadLesson = async () => {
      setLoading(true);
      try {
        const res = await lessonService.getLessonById(lesson!.id);
        if (cancelled) return;
        if (res.success) {
          reset({
            title: res.data.title || "",
            slug: res.data.slug || "",
            isPublished: res.data.isPublished || false,
            seo: {
              metaTitle: res.data.seo?.metaTitle || "",
              metaDescription: res.data.seo?.metaDescription || "",
              metaKeywords: res.data.seo?.metaKeywords || "",
            },
          });
        }
      } catch (error) {
        console.error(error);
        toast.error("Failed to load lesson");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadLesson();
    return () => {
      cancelled = true;
    };
  }, [open, isNew, lesson, reset]);

  const currentSlug = watch("slug");
  const isOriginalSlug = !isNew && currentSlug === lesson?.slug;

  const { slugAvailable: fetchedSlugAvailable, checkingSlug } =
    useSlugAvailability(isOriginalSlug ? "" : currentSlug, (slug) =>
      lessonService.checkLessonSlugAvailability(
        moduleId,
        slug,
        isNew ? undefined : lesson?.id,
      ),
    );

  const slugAvailable = isOriginalSlug ? true : fetchedSlugAvailable;

  const submit = async (
    values: LessonDialogValues,
    thenEditContent: boolean,
  ) => {
    const toastId = toast.loading(
      isNew ? "Creating lesson..." : "Updating lesson...",
    );
    try {
      if (isNew) {
        const res = await lessonService.createLesson(moduleId, {
          ...values,
          content: {},
        });
        if (res.success && res.data?.id) {
          toast.success("Lesson created", { id: toastId });
          onSaved(res.data, true);
          onOpenChange(false);
          if (thenEditContent) onEditContent?.(res.data.id);
        }
      } else {
        const res = await lessonService.updateLesson(lesson!.id, values);
        if (res.success) {
          toast.success("Lesson updated", { id: toastId });
          onSaved({ ...lesson, ...values, ...res.data }, false);
          onOpenChange(false);
          if (thenEditContent) onEditContent?.(lesson!.id);
        }
      }
    } catch (error: any) {
      console.error(error);
      toast.error(
        error.response?.data?.message ||
          `Failed to ${isNew ? "create" : "update"} lesson`,
        { id: toastId },
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? "Add Lesson" : "Edit Lesson"}</DialogTitle>
          <DialogDescription>
            {isNew
              ? "Set the basics now — you can write the content right after."
              : "Update the lesson basics. Content is edited in the full editor."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
        <form
          onSubmit={handleSubmit((values) => submit(values, false))}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="lessonTitle">Title</Label>
            <Input
              id="lessonTitle"
              placeholder="e.g. Lesson 1: Introduction"
              {...register("title")}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lessonSlug">Slug</Label>
            <div className="relative">
              <Input
                id="lessonSlug"
                placeholder="lesson-slug"
                {...register("slug")}
                className={
                  slugAvailable === false
                    ? "border-destructive pr-10"
                    : slugAvailable === true
                      ? "border-green-500 pr-10"
                      : "pr-10"
                }
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {checkingSlug ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : slugAvailable === true ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : slugAvailable === false ? (
                  <X className="h-4 w-4 text-destructive" />
                ) : null}
              </div>
            </div>
            {errors.slug && (
              <p className="text-xs text-destructive">{errors.slug.message}</p>
            )}
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label htmlFor="lessonPublished">Published</Label>
              <p className="text-xs text-muted-foreground">
                Draft lessons stay hidden on the course page.
              </p>
            </div>
            <Switch
              id="lessonPublished"
              checked={watch("isPublished")}
              onCheckedChange={(val) => setValue("isPublished", val)}
            />
          </div>

          <details className="rounded-md border p-3">
            <summary className="cursor-pointer text-sm font-medium">
              SEO settings
            </summary>
            <div className="space-y-3 pt-3">
              <div className="space-y-2">
                <Label htmlFor="lessonMetaTitle">Meta Title</Label>
                <Input
                  id="lessonMetaTitle"
                  placeholder="SEO Title"
                  {...register("seo.metaTitle")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lessonMetaDescription">Meta Description</Label>
                <Textarea
                  id="lessonMetaDescription"
                  placeholder="SEO Description"
                  rows={3}
                  {...register("seo.metaDescription")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="lessonMetaKeywords">Meta Keywords</Label>
                <Input
                  id="lessonMetaKeywords"
                  placeholder="keyword1, keyword2"
                  {...register("seo.metaKeywords")}
                />
              </div>
            </div>
          </details>

          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={isSubmitting || slugAvailable === false}
              onClick={handleSubmit((values) => submit(values, true))}
            >
              {isNew ? "Create & write content" : "Save & edit content"}
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || slugAvailable === false}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : isNew ? (
                "Create Lesson"
              ) : (
                "Save"
              )}
            </Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
