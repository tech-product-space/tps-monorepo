import React, { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { checkLessonSlugAvailability } from "@/services/courses/lessons";
import type { ICourseLesson } from "@/types/course";

/* ---------------- Schema ---------------- */

const lessonBasicInfoSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9-]+$/, "Only lowercase letters, numbers and hyphens"),
  status: z.enum(["draft", "published"]),
});

type LessonBasicInfoFormValues = z.infer<typeof lessonBasicInfoSchema>;

interface Props {
  lesson: ICourseLesson;
  onChange: (values: LessonBasicInfoFormValues) => void;
}

export function LessonBasicInfoForm({ lesson, onChange }: Props) {
  const originalSlugRef = useRef(lesson.slug);

  const form = useForm<LessonBasicInfoFormValues>({
    resolver: zodResolver(lessonBasicInfoSchema),
    defaultValues: {
      title: lesson.title,
      slug: lesson.slug,
      status: lesson.status,
    },
    mode: "onChange",
  });

  const { watch, setValue, formState } = form;

  const watchSlug = watch("slug");
  const watchTitle = watch("title");
  const watchStatus = watch("status");

  const lastSentRef = useRef<LessonBasicInfoFormValues | null>(null);

  const [slugStatus, setSlugStatus] = useState<{
    loading: boolean;
    available: boolean | null;
    message: string;
  }>({
    loading: false,
    available: null,
    message: "",
  });

  /* ---------------- Sync to parent ---------------- */

  useEffect(() => {
    if (!formState.isValid) return;

    const payload: LessonBasicInfoFormValues = {
      title: watchTitle,
      slug: watchSlug,
      status: watchStatus,
    };

    const last = lastSentRef.current;

    if (
      last &&
      last.title === payload.title &&
      last.slug === payload.slug &&
      last.status === payload.status
    ) {
      return;
    }

    lastSentRef.current = payload;
    onChange(payload);
  }, [watchTitle, watchSlug, watchStatus, formState.isValid]);

  /* ---------------- Slug availability ---------------- */

  useEffect(() => {
    const timer = setTimeout(async () => {
      if (!watchSlug || watchSlug.length < 2) {
        setSlugStatus({ loading: false, available: null, message: "" });
        return;
      }

      if (watchSlug === originalSlugRef.current) {
        setSlugStatus({ loading: false, available: null, message: "" });
        return;
      }

      setSlugStatus((prev) => ({ ...prev, loading: true }));

      try {
        const res = await checkLessonSlugAvailability(
          lesson.module_id,
          watchSlug,
          lesson.id,
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
  }, [watchSlug, lesson.module_id, lesson.id, lesson.slug]);

  /* ---------------- UI ---------------- */

  return (
    <Card>
      <CardHeader>
        <CardTitle>Basic Information</CardTitle>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Title */}
        <div className="space-y-1.5">
          <Label>Title</Label>
          <Input
            value={watchTitle}
            onChange={(e) =>
              setValue("title", e.target.value, { shouldValidate: true })
            }
          />
          {formState.errors.title && (
            <p className="text-xs text-red-500">
              {formState.errors.title.message}
            </p>
          )}
        </div>

        {/* Slug */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <Label>Slug</Label>

            {slugStatus.loading && (
              <Loader2 size={12} className="animate-spin text-blue-500" />
            )}

            {slugStatus.available === true && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 size={12} />
                Available
              </span>
            )}

            {slugStatus.available === false && (
              <span className="text-xs text-red-600 flex items-center gap-1">
                <AlertCircle size={12} />
                Taken
              </span>
            )}
          </div>

          <Input
            value={watchSlug}
            onChange={(e) =>
              setValue("slug", e.target.value, { shouldValidate: true })
            }
            className={
              slugStatus.available === false
                ? "border-red-500 focus-visible:ring-red-500"
                : slugStatus.available === true
                  ? "border-green-500 focus-visible:ring-green-500"
                  : ""
            }
          />

          {(formState.errors.slug || slugStatus.message) && (
            <p className="text-xs mt-1 text-gray-500">
              {formState.errors.slug?.message || slugStatus.message}
            </p>
          )}
        </div>

        {/* Status */}
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select
            value={watchStatus}
            onValueChange={(val) =>
              setValue("status", val as any, { shouldValidate: true })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>

            <SelectContent>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="published">Published</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
