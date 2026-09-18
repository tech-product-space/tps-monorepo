"use client";

import type React from "react";
import { useEffect } from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Plus, Trash2 } from "lucide-react";

import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Textarea } from "@/gradient/components/ui/textarea";
import { Label } from "@/gradient/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import { SlugInput } from "@/gradient/components/Common/SlugInput";
import { freeCourseService } from "@/gradient/services/freeCourseService";

const moduleSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z.string().min(1, "Slug is required"),
  subTitle: z.string().optional(),
  overview: z.object({
    moduleDuration: z.string().optional(),
    moduleDescription: z.array(
      z.object({
        title: z.string().min(1, "Title is required"),
        description: z.string().optional(),
      }),
    ),
  }),
});

export type ModuleFormValues = z.infer<typeof moduleSchema>;

interface ModuleFormProps {
  courseId: string;
  initialValues?: any;
  onSubmit: (values: ModuleFormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  loadingLabel: string;
  /** Drop the Card chrome when the form is rendered inside a dialog. */
  bare?: boolean;
}

function ModuleFormHeader() {
  return (
    <CardHeader>
      <CardTitle>Module Details</CardTitle>
    </CardHeader>
  );
}

function NoHeader() {
  return null;
}

function BareBody({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return <div className={className} {...props} />;
}

export default function ModuleForm({
  courseId,
  initialValues,
  onSubmit,
  onCancel,
  submitLabel,
  loadingLabel,
  bare = false,
}: ModuleFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ModuleFormValues>({
    resolver: zodResolver(moduleSchema),
    defaultValues: {
      title: "",
      slug: "",
      subTitle: "",
      overview: {
        moduleDuration: "",
        moduleDescription: [],
      },
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "overview.moduleDescription",
  });

  useEffect(() => {
    if (initialValues) {
      reset({
        title: initialValues.title || "",
        slug: initialValues.slug || "",
        subTitle: initialValues.subTitle || "",
        overview: {
          moduleDuration: initialValues.overview?.moduleDuration || "",
          moduleDescription: initialValues.overview?.moduleDescription || [],
        },
      });
    }
  }, [initialValues, reset]);

  const handleFormSubmit = async (data: ModuleFormValues) => {
    await onSubmit({
      ...data,
    });
  };

  const Shell = bare ? "div" : Card;
  const Header = bare ? NoHeader : ModuleFormHeader;
  const Body = bare ? BareBody : CardContent;

  return (
    <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-6">
      <Shell>
        <Header />
        <Body className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="e.g. Module 1: Introduction"
              {...register("title")}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <Controller
            name="slug"
            control={control}
            render={({ field }) => (
              <SlugInput
                {...field}
                label="Slug"
                placeholder="e.g. module-1-intro"
                initialSlug={initialValues?.slug}
                checkService={(slug) =>
                  freeCourseService.checkModuleSlugAvailability(
                    courseId,
                    slug,
                    initialValues?.id,
                  )
                }
                error={errors.slug?.message}
              />
            )}
          />

          <div className="space-y-2">
            <Label htmlFor="subTitle">Subtitle</Label>
            <Input
              id="subTitle"
              placeholder="e.g. Learn the basics of the course"
              {...register("subTitle")}
            />
          </div>

          <div className="space-y-4 pt-4 border-t">
            <h3 className="font-medium">Overview Details</h3>

            <div className="space-y-2">
              <Label htmlFor="moduleDuration">Module Duration</Label>
              <Input
                id="moduleDuration"
                placeholder="e.g. 1h 30m"
                {...register("overview.moduleDuration")}
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Module Points / Description</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => append({ title: "", description: "" })}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Point
                </Button>
              </div>

              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="space-y-3 p-4 border rounded-md relative bg-muted/30"
                >
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>

                  <div className="space-y-2 pr-8">
                    <Label>Point Title</Label>
                    <Input
                      placeholder="e.g. How backend systems work"
                      {...register(
                        `overview.moduleDescription.${index}.title` as const,
                      )}
                    />
                    {errors.overview?.moduleDescription?.[index]?.title && (
                      <p className="text-xs text-destructive">
                        {errors.overview.moduleDescription[index].title.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Point Description (Optional)</Label>
                    <Textarea
                      placeholder="Understand the role of backend systems..."
                      rows={2}
                      {...register(
                        `overview.moduleDescription.${index}.description` as const,
                      )}
                    />
                  </div>
                </div>
              ))}

              {fields.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
                  No points added yet.
                </p>
              )}
            </div>
          </div>
        </Body>
      </Shell>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {loadingLabel}
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </form>
  );
}
