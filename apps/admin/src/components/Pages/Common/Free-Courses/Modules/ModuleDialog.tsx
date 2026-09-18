import React, { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
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
import {
  CourseModule,
  CreateModulePayload,
  CourseStatus,
} from "@/types/course";
import { Loader2, Plus, CheckCircle2, AlertCircle } from "lucide-react";
import ContentSection, { ContentSectionData } from "../common/ContentSection";
import { checkModuleSlugAvailability } from "@/services/courses/modules";
import { toCourseSlug } from "@/utils/courseSlug";

const formSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9-]+$/, "Slug must be lowercase, numbers, and hyphens only"),
  subtitle: z.string().optional(),
  status: z.enum(["draft", "published"]),
  overview: z
    .object({
      sections: z.array(z.any()),
    })
    .optional(),
});

interface ModuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateModulePayload) => Promise<void>;
  module?: CourseModule | null;
  loading?: boolean;
  courseId: string;
}

export function ModuleDialog({
  open,
  onOpenChange,
  onSubmit,
  module,
  loading,
  courseId,
}: ModuleDialogProps) {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      slug: "",
      subtitle: "",
      status: "draft",
      overview: { sections: [] },
    },
  });

  const overview = useWatch({
    control: form.control,
    name: "overview",
  });
  const sections = overview?.sections || [];

  // Once the slug is typed by hand (or belongs to a saved module) the title
  // stops driving it, so an edit can't silently change a published URL.
  const [slugEdited, setSlugEdited] = React.useState(false);

  useEffect(() => {
    if (open) {
      setSlugEdited(!!module);
      if (module) {
        form.reset({
          title: module.title,
          slug: module.slug || "",
          subtitle: module.subtitle || "",
          status: (module as any).status || "draft",
          overview:
            module.overview && Array.isArray(module.overview.sections)
              ? module.overview
              : { sections: [] },
        });
      } else {
        form.reset({
          title: "",
          slug: "",
          subtitle: "",
          status: "draft",
          overview: { sections: [] },
        });
      }
    }
  }, [module, form, open]);

  const [slugStatus, setSlugStatus] = React.useState<{
    loading: boolean;
    available: boolean | null;
    message: string;
  }>({ loading: false, available: null, message: "" });

  // Check slug availability
  const watchSlug = form.watch("slug");
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (watchSlug && watchSlug.length > 2) {
        // If editing and slug is same as original, it's available
        if (module && watchSlug === module.slug) {
          setSlugStatus({ loading: false, available: true, message: "" });
          return;
        }

        setSlugStatus((prev) => ({ ...prev, loading: true }));
        try {
          const res = await checkModuleSlugAvailability(
            courseId,
            watchSlug,
            module?.id,
          );
          setSlugStatus({
            loading: false,
            available: res.available,
            message: res.available ? "" : "Slug is already taken",
          });
        } catch (error) {
          setSlugStatus({
            loading: false,
            available: null,
            message: "Error checking slug",
          });
        }
      } else {
        setSlugStatus({ loading: false, available: null, message: "" });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [watchSlug, courseId, module]);

  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    await onSubmit(values as CreateModulePayload);
    // Do not reset here, reset is handled by useEffect when open changes or after success in parent
  };

  const addOverviewSection = () => {
    const newSection: ContentSectionData = {
      id: Math.random().toString(36).substr(2, 9),
      heading: "",
      subheading: "",
      elements: [],
    };
    form.setValue(
      "overview",
      {
        sections: [...sections, newSection],
      },
      { shouldDirty: true, shouldTouch: true },
    );
  };

  const updateOverviewSection = (
    index: number,
    newData: ContentSectionData,
  ) => {
    const newSections = [...sections];
    newSections[index] = newData;
    form.setValue(
      "overview",
      { sections: newSections },
      { shouldDirty: true, shouldTouch: true },
    );
  };

  const removeOverviewSection = (index: number) => {
    const newSections = sections.filter((_, i) => i !== index);
    form.setValue(
      "overview",
      { sections: newSections },
      { shouldDirty: true, shouldTouch: true },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[1000px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{module ? "Edit Module" : "Add Module"}</DialogTitle>
          <p className="text-sm text-gray-500">
            Configure module basics and overview content.
          </p>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(handleSubmit)}
            className="space-y-6 py-4"
          >
            <div className="grid grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[13px] font-semibold tracking-wider uppercase text-gray-500">
                      Module Title
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Getting Started"
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
              <FormField
                control={form.control}
                name="slug"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <FormLabel className="text-[13px] font-semibold tracking-wider uppercase text-gray-500">
                        Slug
                      </FormLabel>
                      {slugStatus.loading ? (
                        <Loader2
                          size={12}
                          className="animate-spin text-blue-500"
                        />
                      ) : slugStatus.available === true ? (
                        <div className="flex items-center gap-1 text-[10px] text-green-600 font-medium">
                          <CheckCircle2 size={12} />
                          Available
                        </div>
                      ) : slugStatus.available === false ? (
                        <div className="flex items-center gap-1 text-[10px] text-red-500 font-medium">
                          <AlertCircle size={12} />
                          Taken
                        </div>
                      ) : null}
                    </div>
                    <FormControl>
                      <Input
                        placeholder="e.g. getting-started"
                        {...field}
                        onChange={(e) => {
                          setSlugEdited(true);
                          field.onChange(e);
                        }}
                        onBlur={(e) => {
                          field.onBlur();
                          if (e.target.value.trim()) {
                            form.setValue(
                              "slug",
                              toCourseSlug(e.target.value),
                              { shouldValidate: true },
                            );
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
                    <FormMessage>
                      {slugStatus.message && (
                        <span className="text-red-500 text-xs">
                          {slugStatus.message}
                        </span>
                      )}
                    </FormMessage>
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="subtitle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[13px] font-semibold tracking-wider uppercase text-gray-500">
                      Subtitle
                    </FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. The fundamentals" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[13px] font-semibold tracking-wider uppercase text-gray-500">
                      Status
                    </FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl className="w-full">
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
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
            </div>

            <div className="space-y-4 pt-4 border-t">
              <div className="flex items-center justify-between">
                <FormLabel className="text-[13px] font-semibold   tracking-wider">
                  Module Overview Sections
                </FormLabel>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addOverviewSection}
                  className="gap-2 text-xs"
                >
                  <Plus size={14} />
                  Add Section
                </Button>
              </div>

              <div className="space-y-6">
                {sections.length > 0 ? (
                  sections.map((section: ContentSectionData, idx: number) => (
                    <ContentSection
                      key={section.id}
                      data={section}
                      onChange={(newData) =>
                        updateOverviewSection(idx, newData)
                      }
                      onRemove={() => removeOverviewSection(idx)}
                    />
                  ))
                ) : (
                  <div className="text-center py-8 border-2 border-dashed rounded-lg bg-gray-50/50">
                    <p className="text-sm text-gray-400">
                      No overview sections added. Click "Add Section" to start.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <DialogFooter className="sticky bottom-0 bg-white pt-4 border-t z-10">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-blue-800 hover:bg-blue-900 disabled:opacity-70"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {module ? "Save Changes" : "Create Module"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
