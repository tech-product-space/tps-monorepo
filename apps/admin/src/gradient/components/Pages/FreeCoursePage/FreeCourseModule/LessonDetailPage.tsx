"use client";

import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Check, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { Button } from "@/gradient/components/ui/button";
import { Switch } from "@/gradient/components/ui/switch";
import { Textarea } from "@/gradient/components/ui/textarea";
import { lessonService } from "@/gradient/services/freeCourse/lesson/lesson.service";
import { FreeCourseLesson } from "@/gradient/types/freeCourse";
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

type LessonFormValues = z.infer<typeof lessonSchema>;

interface LessonDetailPageProps {
  lesson: FreeCourseLesson;
  isNew?: boolean;
  moduleId?: string;
  onCreated?: (id: string) => void;
}

export default function LessonDetailPage({
  lesson,
  isNew = false,
  moduleId,
  onCreated,
}: LessonDetailPageProps) {
  const router = useRouter();

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LessonFormValues>({
    resolver: zodResolver(lessonSchema) as Resolver<LessonFormValues>,
    defaultValues: {
      title: lesson.title || "",
      slug: lesson.slug || "",
      isPublished: lesson.isPublished || false,
      seo: {
        metaTitle: lesson.seo?.metaTitle || "",
        metaDescription: lesson.seo?.metaDescription || "",
        metaKeywords: lesson.seo?.metaKeywords || "",
      },
    },
  });

  const currentSlug = watch("slug");
  const isOriginalSlug = !isNew && currentSlug === lesson.slug;

  const { slugAvailable: fetchedSlugAvailable, checkingSlug } =
    useSlugAvailability(isOriginalSlug ? "" : currentSlug, (slug) =>
      lessonService.checkLessonSlugAvailability(
        moduleId || lesson.freeCourseModuleId,
        slug,
        isNew ? undefined : lesson.id,
      ),
    );

  const slugAvailable = isOriginalSlug ? true : fetchedSlugAvailable;

  const onSubmit = async (values: LessonFormValues) => {
    const toastId = toast.loading(
      isNew ? "Creating lesson..." : "Updating lesson...",
    );
    try {
      if (isNew) {
        if (!moduleId) throw new Error("Module ID is missing");
        const res = await lessonService.createLesson(moduleId, {
          ...values,
          content: {},
        });
        if (res.success && res.data?.id) {
          toast.success("Lesson created successfully", { id: toastId });
          onCreated?.(res.data.id);
        }
      } else {
        const res = await lessonService.updateLesson(lesson.id, {
          ...values,
          content: lesson.content,
        });
        if (res.success) {
          toast.success("Lesson updated successfully", { id: toastId });
          router.refresh();
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
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  placeholder="e.g. Lesson 1: Introduction"
                  {...register("title")}
                />
                {errors.title && (
                  <p className="text-xs text-destructive">
                    {errors.title.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <div className="relative">
                  <Input
                    id="slug"
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
                  <p className="text-xs text-destructive">
                    {errors.slug.message}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SEO Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="metaTitle">Meta Title</Label>
                <Input
                  id="metaTitle"
                  placeholder="SEO Title"
                  {...register("seo.metaTitle")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="metaDescription">Meta Description</Label>
                <Textarea
                  id="metaDescription"
                  placeholder="SEO Description"
                  rows={3}
                  {...register("seo.metaDescription")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="metaKeywords">Meta Keywords</Label>
                <Input
                  id="metaKeywords"
                  placeholder="keyword1, keyword2"
                  {...register("seo.metaKeywords")}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <Label htmlFor="isPublished">Published</Label>
                <Switch
                  id="isPublished"
                  checked={watch("isPublished")}
                  onCheckedChange={(val) => setValue("isPublished", val)}
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting || slugAvailable === false}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}
