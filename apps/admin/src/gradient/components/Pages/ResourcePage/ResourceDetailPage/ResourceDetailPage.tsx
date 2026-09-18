"use client";

import { useForm, useFieldArray, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ResourceResponse } from "@/gradient/types/resource";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import { Input } from "@/gradient/components/ui/input";
import { Textarea } from "@/gradient/components/ui/textarea";
import { Label } from "@/gradient/components/ui/label";
import { Button } from "@/gradient/components/ui/button";
import { resourceService } from "@/gradient/services/resourceService";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
import TiptapEditor from "@/gradient/components/TiptapEditor/TiptapEditor";

import {
  Loader2,
  Check,
  X,
  Plus,
  Trash2,
  Users,
  BookOpen,
  Info,
  FileText,
  ExternalLink,
} from "lucide-react";
import { uploadFile } from "@/gradient/services/fileUpload";
import { resolveStorageUrl } from "@/gradient/lib/storage";
import { useSlugAvailability } from "@/gradient/hooks/useSlugAvailability";
import {
  RESOURCE_CATEGORIES,
  RESOURCE_TYPES,
  ResourceCategory,
  ResourceType,
} from "@/gradient/components/constants/resourceCategories";
import { ImagePickerDialog } from "@/gradient/components/ui/ImagePickerDialog/ImagePickerDialog";

// ─── Schema ───────────────────────────────────────────────────────────────────

const authorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  company: z.string().min(1, "Company is required"),
  designation: z.string().min(1, "Designation is required"),
  authorBio: z.string().min(1, "Bio is required"),
  imageKey: z.string().min(1, "Image is required"),
});

const whatYoullLearnSchema = z.object({
  title: z.string().optional(),
  items: z
    .array(
      z.object({
        title: z.string().min(1, "Title is required"),
        description: z.string().min(1, "Description is required"),
      }),
    )
    .default([]),
});

const whyTopicMattersSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
});

const resourceDetailsSchema = z.object({
  type: z.string().default("pdf"),
  pdfLink: z.string().optional(),
  description: z.any(),
});

const resourceSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(100, "Title must be 100 characters or fewer"),

  subtitle: z
    .string()
    .min(1, "Subtitle is required")
    .max(200, "Subtitle must be 200 characters or fewer"),
  resourceType: z.string().min(1, "Resource Type is required"),
  resourceCategory: z.string().min(1, "Resource Category is required"),

  resourceSlug: z
    .string()
    .min(1, "Slug is required")
    .max(100, "Slug must be 100 characters or fewer")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must be lowercase letters, numbers, and hyphens only (e.g. my-resource)",
    ),

  thumbnailSrc: z.string().min(1, "Thumbnail image is required"),

  tagPrimary: z
    .string()
    .min(1, "At least one primary tag is required")
    .max(200, "Primary tags must be 200 characters or fewer"),

  tagSecondary: z
    .string()
    .min(1, "At least one secondary tag is required")
    .max(200, "Secondary tags must be 200 characters or fewer"),

  metaTitle: z
    .string()
    .min(1, "Meta title is required")
    .max(60, "Meta title must be 60 characters or fewer"),

  metaDesc: z
    .string()
    .min(1, "Meta description is required")
    .max(160, "Meta description must be 160 characters or fewer"),

  authorDetails: z.array(authorSchema),
  whatYoullLearn: whatYoullLearnSchema,
  whyTopicMatters: whyTopicMattersSchema,
  resourceDetails: resourceDetailsSchema,
  publishedDate: z.string().min(1, "Published date is required"),
});

type ResourceFormValues = z.infer<typeof resourceSchema>;

// ─── Component ────────────────────────────────────────────────────────────────

interface ResourceDetailPageProps {
  resource: ResourceResponse;
}

export const ResourceDetailPage = ({ resource }: ResourceDetailPageProps) => {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ResourceFormValues>({
    resolver: zodResolver(resourceSchema) as Resolver<ResourceFormValues>,
    defaultValues: {
      title: resource.title || "",
      subtitle: resource.subtitle || "",
      resourceType: (resource.resourceType as ResourceType) || undefined,
      resourceCategory:
        (resource.resourceCategory as ResourceCategory) || undefined,
      resourceSlug: resource.resourceSlug || "",
      thumbnailSrc: resource.thumbnailSrc || "",
      tagPrimary: resource.tagPrimary?.join(", ") || "",
      tagSecondary: resource.tagSecondary?.join(", ") || "",
      metaTitle: resource.seo?.metaTitle || "",
      metaDesc: resource.seo?.metaDesc || "",
      authorDetails: resource.authorDetails || [],
      whatYoullLearn: {
        title:
          resource.resourceContent?.whatYoullLearn?.title ||
          "WHAT YOU'LL LEARN",
        items: resource.resourceContent?.whatYoullLearn?.items || [],
      },
      whyTopicMatters: {
        title:
          resource.resourceContent?.whyTopicMatters?.title ||
          "WHY THIS TOPIC MATTERS",
        description:
          resource.resourceContent?.whyTopicMatters?.description || "",
      },
      resourceDetails: {
        type: resource.resourceDetails?.type || "pdf",
        pdfLink: resource.resourceDetails?.pdfLink || "",
        description:
          (resource.resourceDetails?.description as Record<string, unknown>) ??
          undefined,
      },
      publishedDate: resource.resourceContent?.publishedDate
        ? resource.resourceContent?.publishedDate.includes("T")
          ? resource.resourceContent?.publishedDate.split("T")[0]
          : resource.resourceContent?.publishedDate.slice(0, 10)
        : "",
    },
  });

  const {
    fields: authorFields,
    append: appendAuthor,
    remove: removeAuthor,
  } = useFieldArray({
    control,
    name: "authorDetails",
  });

  const {
    fields: learnFields,
    append: appendLearn,
    remove: removeLearn,
  } = useFieldArray({
    control,
    name: "whatYoullLearn.items",
  });

  const thumbnailSrc = watch("thumbnailSrc");
  const pdfLink = watch("resourceDetails.pdfLink");

  const currentUrl = watch("resourceSlug");
  const isOriginalSlug = currentUrl === resource.resourceSlug;
  const { slugAvailable: fetchedSlugAvailable, checkingSlug } =
    useSlugAvailability(
      isOriginalSlug ? "" : currentUrl,
      resourceService.checkSlugAvailability,
    );
  const slugAvailable = isOriginalSlug ? true : fetchedSlugAvailable;

  const handleTypeChange = (value: string) => {
    setValue("resourceType", value as ResourceType, { shouldValidate: true });
  };

  const handleCategoryChange = (value: string) => {
    setValue("resourceCategory", value as ResourceCategory, {
      shouldValidate: true,
    });
  };

  const onSubmit = async (values: ResourceFormValues) => {
    const toastId = toast.loading("Updating resource...");

    try {
      if (!resource?.id) {
        toast.error("Resource ID is missing", { id: toastId });
        return;
      }

      const payload = {
        title: values.title,
        subtitle: values.subtitle,
        resourceType: values.resourceType,
        resourceCategory: values.resourceCategory,
        resourceSlug: values.resourceSlug,
        thumbnailSrc: values.thumbnailSrc,
        tagPrimary: values.tagPrimary
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        tagSecondary: values.tagSecondary
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        seo: {
          metaTitle: values.metaTitle,
          metaDesc: values.metaDesc,
        },
        authorDetails: values.authorDetails,
        resourceDetails: {
          ...values.resourceDetails,
          description: values.resourceDetails.description ?? null,
        },
        resourceContent: {
          ...resource.resourceContent,
          whatYoullLearn: values.whatYoullLearn,
          whyTopicMatters: values.whyTopicMatters,
          publishedDate: values.publishedDate,
        },
      };

      await resourceService.updateResource(resource.id, payload);
      toast.success("Resource updated successfully", { id: toastId });
    } catch (error: any) {
      console.error(error);
      toast.error(
        error.response?.data?.message || "Failed to update resource",
        { id: toastId },
      );
    }
  };

  const MAX_FILE_SIZE = 1.2 * 1024 * 1024;

  const handleThumbnailUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
      toast.error(`File is ${sizeMB} MB. Max allowed size is 1.2 MB.`);
      e.target.value = "";
      return;
    }

    try {
      if (!resource?.id) {
        toast.error("Resource ID missing");
        return;
      }
      const key = await uploadFile(file, "resource", resource.id);
      setValue("thumbnailSrc", key, { shouldValidate: true });
      toast.success("Image uploaded successfully");
    } catch (err) {
      console.error(err);
      toast.error("Please upload the image under 4 Mb");
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      toast.error("PDF is too large. Max 20MB allowed.");
      return;
    }

    try {
      if (!resource?.id) {
        toast.error("Resource ID missing");
        return;
      }
      const existingPdf = watch("resourceDetails.pdfLink");
      const key = await uploadFile(file, "resource", resource.id);
      setValue("resourceDetails.pdfLink", key, { shouldValidate: true });
      toast.success("PDF uploaded successfully");
    } catch (err) {
      console.error(err);
      toast.error("PDF upload failed.");
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-6 w-full"
      noValidate
    >
      {/* ── Core Information ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
            Core Information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="Enter resource title"
                aria-invalid={!!errors.title}
                {...register("title")}
              />
              {errors.title && (
                <p className="text-xs text-destructive">
                  {errors.title.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="resourceSlug">Slug</Label>
              <div className="relative">
                <Input
                  id="resourceSlug"
                  placeholder="resource-slug"
                  aria-invalid={!!errors.resourceSlug}
                  className={
                    slugAvailable === false
                      ? "border-red-500 focus-visible:ring-red-500 pr-10"
                      : slugAvailable === true
                        ? "border-green-500 focus-visible:ring-green-500 pr-10"
                        : "pr-10"
                  }
                  {...register("resourceSlug")}
                />
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  {checkingSlug ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : slugAvailable === true ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : slugAvailable === false ? (
                    <X className="w-4 h-4 text-red-500" />
                  ) : null}
                </div>
              </div>
              {slugAvailable === false && (
                <p className="text-xs text-red-500">
                  This slug is already taken.
                </p>
              )}
              {errors.resourceSlug && (
                <p className="text-xs text-destructive">
                  {errors.resourceSlug.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subtitle">Subtitle</Label>
            <Input
              id="subtitle"
              placeholder="Enter subtitle"
              aria-invalid={!!errors.subtitle}
              {...register("subtitle")}
            />
            {errors.subtitle && (
              <p className="text-xs text-destructive">
                {errors.subtitle.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="publishedDate">Published Date</Label>
            <Input
              id="publishedDate"
              type="date"
              aria-invalid={!!errors.publishedDate}
              {...register("publishedDate")}
            />
            {errors.publishedDate && (
              <p className="text-xs text-destructive">
                {errors.publishedDate.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5 w-full">
              <Label htmlFor="resourceCategory">Resource Category</Label>
              <Select
                value={watch("resourceCategory")}
                onValueChange={handleCategoryChange}
              >
                <SelectTrigger
                  id="resourceCategory"
                  className="w-full"
                  aria-invalid={!!errors.resourceCategory}
                >
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.resourceCategory && (
                <p className="text-xs text-destructive">
                  {errors.resourceCategory.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="resourceType">Resource Type</Label>
              <Select
                value={watch("resourceType")}
                onValueChange={handleTypeChange}
              >
                <SelectTrigger
                  id="resourceType"
                  className="w-full"
                  aria-invalid={!!errors.resourceType}
                >
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {RESOURCE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.resourceType && (
                <p className="text-xs text-destructive">
                  {errors.resourceType.message}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Media & Tags ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
            Media & Tags
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label>Thumbnail Image</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={handleThumbnailUpload}
              className="w-fit cursor-pointer"
            />
            {errors.thumbnailSrc && (
              <p className="text-xs text-destructive">
                {errors.thumbnailSrc.message}
              </p>
            )}
            {thumbnailSrc && (
              <img
                src={resolveStorageUrl(thumbnailSrc)}
                alt="thumbnail preview"
                className="w-40 h-auto rounded mt-2 border"
              />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="tagPrimary">Primary Tags</Label>
              <Input
                id="tagPrimary"
                placeholder="tag1, tag2"
                aria-invalid={!!errors.tagPrimary}
                {...register("tagPrimary")}
              />
              {errors.tagPrimary ? (
                <p className="text-xs text-destructive">
                  {errors.tagPrimary.message}
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  Comma-separated
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="tagSecondary">Secondary Tags</Label>
              <Input
                id="tagSecondary"
                placeholder="tag3, tag4"
                aria-invalid={!!errors.tagSecondary}
                {...register("tagSecondary")}
              />
              {errors.tagSecondary ? (
                <p className="text-xs text-destructive">
                  {errors.tagSecondary.message}
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground">
                  Comma-separated
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── Author Details ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
              Author Details
            </CardTitle>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              appendAuthor({
                name: "",
                company: "",
                designation: "",
                authorBio: "",
                imageKey: "",
              })
            }
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Author
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {authorFields.map((field, index) => (
            <div
              key={field.id}
              className="p-4 border rounded-lg bg-muted/30 relative"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 text-destructive hover:text-destructive"
                onClick={() => removeAuthor(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    {...register(`authorDetails.${index}.name`)}
                    placeholder="Author name"
                  />
                  {errors.authorDetails?.[index]?.name && (
                    <p className="text-xs text-destructive">
                      {errors.authorDetails[index].name?.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Company</Label>
                  <Input
                    {...register(`authorDetails.${index}.company`)}
                    placeholder="Company"
                  />
                  {errors.authorDetails?.[index]?.company && (
                    <p className="text-xs text-destructive">
                      {errors.authorDetails[index].company?.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Designation</Label>
                  <Input
                    {...register(`authorDetails.${index}.designation`)}
                    placeholder="Designation"
                  />
                  {errors.authorDetails?.[index]?.designation && (
                    <p className="text-xs text-destructive">
                      {errors.authorDetails[index].designation?.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Image Key</Label>

                  <div className="flex items-center gap-2">
                    <Input
                      {...register(`authorDetails.${index}.imageKey`)}
                      placeholder="Image key"
                      readOnly
                    />

                    <ImagePickerDialog
                      onSelect={(key) => {
                        setValue(`authorDetails.${index}.imageKey`, key);
                      }}
                    />
                  </div>

                  {/* ✅ Error */}
                  {errors.authorDetails?.[index]?.imageKey && (
                    <p className="text-xs text-destructive">
                      {errors.authorDetails[index].imageKey?.message}
                    </p>
                  )}

                  {/* ✅ Preview */}
                  {watch(`authorDetails.${index}.imageKey`) && (
                    <img
                      src={resolveStorageUrl(
                        watch(`authorDetails.${index}.imageKey`),
                      )}
                      alt="author"
                      className="w-20 h-auto rounded-md object-cover mt-2 border"
                    />
                  )}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Author Bio</Label>
                  <Textarea
                    {...register(`authorDetails.${index}.authorBio`)}
                    placeholder="Author bio"
                  />
                  {errors.authorDetails?.[index]?.authorBio && (
                    <p className="text-xs text-destructive">
                      {errors.authorDetails[index].authorBio?.message}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── What You'll Learn ── */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
              What You'll Learn
            </CardTitle>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => appendLearn({ title: "", description: "" })}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="learnTitle">Section Name</Label>
            <Input
              id="learnTitle"
              placeholder="e.g. WHAT YOU'LL LEARN"
              {...register("whatYoullLearn.title")}
            />
          </div>

          <div className="space-y-4">
            {learnFields.map((field, index) => (
              <div
                key={field.id}
                className="p-4 border rounded-lg bg-muted/30 relative space-y-3"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 text-destructive hover:text-destructive"
                  onClick={() => removeLearn(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input
                    {...register(`whatYoullLearn.items.${index}.title`)}
                    placeholder="e.g. Build from real customer pain"
                  />
                  {errors.whatYoullLearn?.items?.[index]?.title && (
                    <p className="text-xs text-destructive">
                      {errors.whatYoullLearn.items[index].title?.message}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea
                    {...register(`whatYoullLearn.items.${index}.description`)}
                    placeholder="e.g. The instinct you only develop..."
                    rows={2}
                  />
                  {errors.whatYoullLearn?.items?.[index]?.description && (
                    <p className="text-xs text-destructive">
                      {errors.whatYoullLearn.items[index].description?.message}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Why This Topic Matters ── */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Info className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
            Why This Topic Matters
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="topicTitle">Section Name</Label>
            <Input
              id="topicTitle"
              placeholder="e.g. WHY THIS TOPIC MATTERS"
              {...register("whyTopicMatters.title")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="topicDesc">Description</Label>
            <Textarea
              id="topicDesc"
              placeholder="e.g. Every AI company you admire..."
              rows={4}
              {...register("whyTopicMatters.description")}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Resource Content Details ── */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
            Resource Content Details
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="pdfUpload">Upload PDF Content</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="pdfUpload"
                  type="file"
                  accept=".pdf"
                  onChange={handlePdfUpload}
                  className="w-fit cursor-pointer"
                />
                {pdfLink && (
                  <>
                    {/* Uploaded indicator */}
                    <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 px-3 py-1.5 rounded-md border border-green-100">
                      <Check size={14} />
                      Uploaded: {pdfLink.split("/").pop()}
                    </div>

                    {/* CTA Button */}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="flex items-center gap-2"
                      onClick={() => {
                        const url = resolveStorageUrl(pdfLink);
                        window.open(url, "_blank", "noopener,noreferrer");
                      }}
                    >
                      <ExternalLink size={14} />
                      Open PDF
                    </Button>
                  </>
                )}
              </div>
              {errors.resourceDetails?.pdfLink && (
                <p className="text-xs text-destructive">
                  {errors.resourceDetails.pdfLink.message}
                </p>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <div className="min-h-[400px] border rounded-md py-5">
              <TiptapEditor
                blogId={resource.id}
                initialContent={
                  watch("resourceDetails.description") ?? undefined
                }
                onChange={(data) => {
                  setValue(
                    "resourceDetails.description",
                    data.content as Record<string, unknown>,
                    { shouldDirty: true },
                  );
                }}
              />
            </div>
            {errors.resourceDetails?.description?.message && (
              <p className="text-xs text-destructive">
                {errors.resourceDetails.description.message as string}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── SEO / Meta ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
            SEO / Meta
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5">
          <div className="space-y-1.5">
            <Label htmlFor="metaTitle">Meta Title</Label>
            <Input
              id="metaTitle"
              placeholder="SEO title (max 60 chars)"
              aria-invalid={!!errors.metaTitle}
              {...register("metaTitle")}
            />
            {errors.metaTitle && (
              <p className="text-xs text-destructive">
                {errors.metaTitle.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="metaDesc">Meta Description</Label>
            <Textarea
              id="metaDesc"
              placeholder="SEO description (max 160 chars)..."
              rows={3}
              className="resize-none"
              aria-invalid={!!errors.metaDesc}
              {...register("metaDesc")}
            />
            {errors.metaDesc && (
              <p className="text-xs text-destructive">
                {errors.metaDesc.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end pb-10">
        <Button
          type="submit"
          disabled={isSubmitting || slugAvailable === false || checkingSlug}
          className="w-36"
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
      </div>
    </form>
  );
};
