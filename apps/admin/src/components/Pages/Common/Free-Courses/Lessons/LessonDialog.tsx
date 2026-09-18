import React, { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toCourseSlug } from "@/utils/courseSlug";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { ICourseLesson } from "@/types/course";
import { checkLessonSlugAvailability } from "@/services/courses/lessons";

/* ---------------- Schema ---------------- */

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase, numbers, and hyphens only"),
  status: z.enum(["draft", "published"]),
});

export type CreateLessonPayload = z.infer<typeof formSchema>;

/* ---------------- Props ---------------- */

interface LessonDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateLessonPayload) => Promise<void>;
  loading?: boolean;
  lesson?: ICourseLesson | null;
  moduleId: string;
}

/* ---------------- Component ---------------- */

export function LessonDialog({
  open,
  onOpenChange,
  onSubmit,
  loading = false,
  lesson,
  moduleId,
}: LessonDialogProps) {
  const form = useForm<CreateLessonPayload>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      slug: "",
      status: "draft",
    },
  });

  const [slugStatus, setSlugStatus] = React.useState<{
    loading: boolean;
    available: boolean | null;
    message: string;
  }>({
    loading: false,
    available: null,
    message: "",
  });

  // Once the slug is typed by hand (or belongs to a saved lesson) the title
  // stops driving it, so an edit can't silently change a published URL.
  const [slugEdited, setSlugEdited] = React.useState(false);

  /* -------- Reset form on open -------- */

  useEffect(() => {
    if (!open) return;
    setSlugEdited(!!lesson);

    if (lesson) {
      form.reset({
        title: lesson.title,
        slug: lesson.slug,
        status: lesson.status,
      });
    } else {
      form.reset({
        title: "",
        slug: "",
        status: "draft",
      });
    }

    setSlugStatus({ loading: false, available: null, message: "" });
  }, [open, lesson, form]);

  /* -------- Slug availability -------- */

  const watchSlug = form.watch("slug");

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!watchSlug || watchSlug.length < 2) {
        setSlugStatus({ loading: false, available: null, message: "" });
        return;
      }

      if (lesson && watchSlug === lesson.slug) {
        setSlugStatus({ loading: false, available: true, message: "" });
        return;
      }

      setSlugStatus((prev) => ({ ...prev, loading: true }));

      try {
        const res = await checkLessonSlugAvailability(
          moduleId,
          watchSlug,
          lesson?.id,
        );

        setSlugStatus({
          loading: false,
          available: res.available,
          message: res.available ? "" : "Slug is already taken",
        });
      } catch {
        setSlugStatus({
          loading: false,
          available: null,
          message: "Error checking slug",
        });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [watchSlug, moduleId, lesson]);

  /* -------- Submit -------- */

  const handleSubmit = async (values: CreateLessonPayload) => {
    await onSubmit(values);
  };

  const disableSubmit = loading || slugStatus.available === false;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{lesson ? "Edit Lesson" : "Add Lesson"}</DialogTitle>
          <p className="text-sm text-gray-500">Configure lesson basics.</p>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6 py-4"
          >
            {/* Title */}
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold uppercase text-gray-500">
                    Lesson Title
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g. Introduction"
                      {...field}
                      onChange={(e) => {
                        field.onChange(e);
                        if (!slugEdited) {
                          form.setValue("slug", toCourseSlug(e.target.value), {
                            shouldValidate: true,
                          });
                        }
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Slug */}
            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-xs font-semibold uppercase text-gray-500">
                      Slug
                    </FormLabel>

                    {slugStatus.loading && (
                      <Loader2
                        size={12}
                        className="animate-spin text-blue-500"
                      />
                    )}

                    {slugStatus.available === true && (
                      <div className="flex items-center gap-1 text-[10px] text-green-600 font-medium">
                        <CheckCircle2 size={12} />
                        Available
                      </div>
                    )}

                    {slugStatus.available === false && (
                      <div className="flex items-center gap-1 text-[10px] text-red-500 font-medium">
                        <AlertCircle size={12} />
                        Taken
                      </div>
                    )}
                  </div>

                  <FormControl>
                    <Input
                      {...field}
                      placeholder="e.g. introduction"
                      onChange={(e) => {
                        setSlugEdited(true);
                        field.onChange(e);
                      }}
                      onBlur={(e) => {
                        field.onBlur();
                        if (e.target.value.trim()) {
                          form.setValue("slug", toCourseSlug(e.target.value), {
                            shouldValidate: true,
                          });
                        }
                      }}
                      className={
                        slugStatus.available === false
                          ? "border-red-500 focus-visible:ring-red-500"
                          : slugStatus.available === true
                            ? "border-green-500 focus-visible:ring-green-500"
                            : ""
                      }
                    />
                  </FormControl>

                  <FormMessage />
                  {slugStatus.message && (
                    <p className="text-xs text-red-500 mt-1">
                      {slugStatus.message}
                    </p>
                  )}
                </FormItem>
              )}
            />

            {/* Status */}
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-xs font-semibold uppercase text-gray-500">
                    Status
                  </FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl className="w-full">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Published</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Footer */}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>

              <Button
                type="submit"
                disabled={disableSubmit}
                className="bg-blue-800 hover:bg-blue-900 disabled:opacity-70"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {lesson ? "Save Lesson" : "Create Lesson"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
