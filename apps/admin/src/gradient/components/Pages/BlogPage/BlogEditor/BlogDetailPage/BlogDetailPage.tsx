"use client";

import { useCallback } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { BlogResponse } from "@/gradient/services/blogService";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import { Input } from "@/gradient/components/ui/input";
import { Textarea } from "@/gradient/components/ui/textarea";
import { Label } from "@/gradient/components/ui/label";
import { blogService } from "@/gradient/services/blogService";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
import { BLOG_CATEGORIES } from "@/gradient/components/constants/blogCategories";
import { uploadFile } from "@/gradient/services/fileUpload";
import { Loader2, Check, X } from "lucide-react";
import { resolveStorageUrl } from "@/gradient/lib/storage";
import { useSlugAvailability } from "@/gradient/hooks/useSlugAvailability";
import { ImagePickerDialog } from "@/gradient/components/ui/ImagePickerDialog/ImagePickerDialog";
import { Switch } from "@/gradient/components/ui/switch";
import {
  useBlogEditorSection,
  type SectionSaveResult,
} from "../BlogEditorContext";

// ─── Schema ───────────────────────────────────────────────────────────────────

const blogSchema = z.object({
  title: z.string().min(1, "Title is required"),
  subTitle: z.string().min(1, "Subtitle is required"),
  category: z.string().min(1, "Category is required"),
  url: z.string().min(1, "URL slug is required"),
  publishedDate: z.string().min(1, "Published date is required"),
  tags: z.string().min(1, "At least one tag is required"),
  readTime: z.coerce.number().min(1, "Read time must be at least 1 minute"),
  metaTitle: z.string().min(1, "Meta title is required"),
  metaDesc: z.string().min(1, "Meta description is required"),
  thumbnailSrc: z.string().min(1, "Thumbnail image is required"),
  thumbnailAlt: z.string().min(1, "Thumbnail alt text is required"),
  authorName: z.string().min(1, "Author name is required"),
  authorCompany: z.string().min(1, "Author company is required"),
  authorDesignation: z.string().min(1, "Author designation is required"),
  authorImgSrc: z.string().min(1, "Author profile image key is required"),
  authorImgAlt: z.string().min(1, "Author image alt text is required"),
  isFeatured: z.boolean().optional(),
});

type BlogFormValues = z.infer<typeof blogSchema>;

// ─── Component ────────────────────────────────────────────────────────────────

interface BlogDetailPageProps {
  blog: BlogResponse;
}

export const BlogDetailPage = ({ blog }: BlogDetailPageProps) => {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    setError,
    formState: { errors, isDirty },
  } = useForm<BlogFormValues>({
    resolver: zodResolver(blogSchema) as Resolver<BlogFormValues>,
    defaultValues: {
      title: blog.title || "",
      subTitle: blog.subTitle || "",
      category: blog.category || "",
      url: blog.url || "",
      publishedDate: blog.publishedDate
        ? blog.publishedDate.includes("T")
          ? blog.publishedDate.split("T")[0]
          : blog.publishedDate.slice(0, 10)
        : "",
      tags: blog.tags?.join(", ") || "",
      readTime: blog.readTime || 0,
      metaTitle: blog.seo?.metaTitle || "",
      metaDesc: blog.seo?.metaDesc || "",
      thumbnailSrc: blog.thumbnailSrc || "",
      thumbnailAlt: blog.thumbnailAlt || "",
      authorName: blog.authorDetails?.name || "",
      authorCompany: blog.authorDetails?.company || "",
      authorDesignation: blog.authorDetails?.designation || "",
      authorImgSrc: blog.authorDetails?.imgSrc || "",
      authorImgAlt: blog.authorDetails?.imgAlt || "",
      isFeatured: blog.isFeatured || false,
    },
  });

  const handleCategoryChange = (value: string) => {
    setValue("category", value, { shouldValidate: true, shouldDirty: true });
  };

  const currentUrl = watch("url");
  const isOriginalSlug = currentUrl === blog.url;
  const { slugAvailable: fetchedSlugAvailable, checkingSlug } =
    useSlugAvailability(
      isOriginalSlug ? "" : currentUrl,
      blogService.checkSlugAvailability,
    );
  const slugAvailable = isOriginalSlug ? true : fetchedSlugAvailable;

  const onSubmit = async (values: BlogFormValues) => {
    const payload: Partial<BlogResponse> = {
      title: values.title,
      subTitle: values.subTitle,
      category: values.category,
      url: values.url,
      publishedDate: values.publishedDate,
      tags: values.tags
        ?.split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      readTime: values.readTime,
      seo: {
        metaTitle: values.metaTitle,
        metaDesc: values.metaDesc,
      },
      thumbnailSrc: values.thumbnailSrc,
      thumbnailAlt: values.thumbnailAlt,
      authorDetails: {
        name: values.authorName,
        company: values.authorCompany,
        designation: values.authorDesignation,
        imgSrc: values.authorImgSrc,
        imgAlt: values.authorImgAlt,
      },
      isFeatured: values.isFeatured || false,
    };

    if (!blog?.id) throw new Error("Blog ID is missing");

    await blogService.updateBlog(blog.id, payload);
    // Re-baseline so the form reports itself clean again.
    reset(values);
  };

  const save = useCallback(async (): Promise<SectionSaveResult> => {
    if (slugAvailable === false) {
      setError("url", {
        type: "manual",
        message: "This slug is already taken.",
      });
      return "invalid";
    }

    let outcome: SectionSaveResult = "invalid";
    await handleSubmit(async (values) => {
      await onSubmit(values);
      outcome = "saved";
    })();

    return outcome;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [handleSubmit, setError, slugAvailable]);

  useBlogEditorSection("basic", isDirty, save);

  const thumbnailSrc = watch("thumbnailSrc");

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
      if (!blog?.id) {
        toast.error("Blog ID missing");
        return;
      }
      const key = await uploadFile(file, "blog", blog.id);
      setValue("thumbnailSrc", key, {
        shouldValidate: true,
        shouldDirty: true,
      });
      toast.success(`Image Uploaded successfully`);
    } catch (err) {
      console.error(err);
      toast.error("Upload failed. Please try again.");
    }
  };

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="space-y-6 w-full"
    >
      {/* Core Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
            Core Information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5">
          <div className="space-y-1.5">
            <Label htmlFor="title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="title"
              placeholder="Enter blog title"
              {...register("title")}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subTitle">
              Subtitle <span className="text-destructive">*</span>
            </Label>
            <Input
              id="subTitle"
              placeholder="Enter subtitle"
              {...register("subTitle")}
            />
            {errors.subTitle && (
              <p className="text-xs text-destructive">
                {errors.subTitle.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5 w-full">
              <Label htmlFor="category">
                Category <span className="text-destructive">*</span>
              </Label>
              <Select
                value={watch("category")}
                onValueChange={handleCategoryChange}
              >
                <SelectTrigger id="category" className="w-full">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {BLOG_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.category && (
                <p className="text-xs text-destructive">
                  {errors.category.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="url">
                URL Slug <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="url"
                  placeholder="url-slug"
                  className={`font-mono text-sm ${
                    slugAvailable === false
                      ? "border-red-500 focus-visible:ring-red-500 pr-10"
                      : slugAvailable === true
                        ? "border-green-500 focus-visible:ring-green-500 pr-10"
                        : "pr-10"
                  }`}
                  {...register("url")}
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
              {errors.url && (
                <p className="text-xs text-destructive">{errors.url.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="readTime">
                Read Time (minutes) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="readTime"
                type="number"
                placeholder="0"
                className="w-full"
                {...register("readTime", { valueAsNumber: true })}
              />
              {errors.readTime && (
                <p className="text-xs text-destructive">
                  {errors.readTime.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="publishedDate">
                Published Date <span className="text-destructive">*</span>
              </Label>
              <Input
                id="publishedDate"
                type="date"
                {...register("publishedDate")}
              />
              {errors.publishedDate && (
                <p className="text-xs text-destructive">
                  {errors.publishedDate.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="tags">
                Tags <span className="text-destructive">*</span>
              </Label>
              <Input
                id="tags"
                placeholder="tag1, tag2, tag3"
                {...register("tags")}
              />
              {errors.tags ? (
                <p className="text-xs text-destructive">
                  {errors.tags.message}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Comma-separated list of tags
                </p>
              )}
            </div>

            <div className="flex items-center justify-between border rounded-md p-3">
              <div>
                <Label className="text-sm font-medium">Featured Blog</Label>
                <p className="text-xs text-muted-foreground">
                  This blog will appear in the featured section
                </p>
              </div>

              <Switch
                checked={watch("isFeatured")}
                onCheckedChange={(val) =>
                  setValue("isFeatured", val, { shouldDirty: true })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Author Details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
            Author Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <Label htmlFor="authorName">
              Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="authorName"
              placeholder="Author name"
              {...register("authorName")}
            />
            {errors.authorName && (
              <p className="text-xs text-destructive">
                {errors.authorName.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="authorCompany">
              Company <span className="text-destructive">*</span>
            </Label>
            <Input
              id="authorCompany"
              placeholder="Company name"
              {...register("authorCompany")}
            />
            {errors.authorCompany && (
              <p className="text-xs text-destructive">
                {errors.authorCompany.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="authorDesignation">
              Designation <span className="text-destructive">*</span>
            </Label>
            <Input
              id="authorDesignation"
              placeholder="e.g. Senior Engineer"
              {...register("authorDesignation")}
            />
            {errors.authorDesignation && (
              <p className="text-xs text-destructive">
                {errors.authorDesignation.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="authorImgSrc">
              Profile Image Key <span className="text-destructive">*</span>
            </Label>

            <div className="flex items-center gap-2">
              <Input
                id="authorImgSrc"
                placeholder="Enter only the Key"
                {...register("authorImgSrc")}
                readOnly
              />

              <ImagePickerDialog
                onSelect={(key) => {
                  setValue("authorImgSrc", key, {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                }}
              />
            </div>

            {/* ✅ Error */}
            {errors.authorImgSrc && (
              <p className="text-xs text-destructive">
                {errors.authorImgSrc.message}
              </p>
            )}

            {/* ✅ Preview */}
            {watch("authorImgSrc") && (
              <img
                src={resolveStorageUrl(watch("authorImgSrc"))}
                alt="author"
                className="w-20 h-auto rounded-md object-cover mt-2 border"
              />
            )}
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="authorImgAlt">
              Profile Image Alt Text <span className="text-destructive">*</span>
            </Label>
            <Input
              id="authorImgAlt"
              placeholder="Alt text for author image"
              {...register("authorImgAlt")}
            />
            {errors.authorImgAlt && (
              <p className="text-xs text-destructive">
                {errors.authorImgAlt.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Thumbnail */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
            Thumbnail
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5">
          <div className="space-y-1.5">
            <Label>
              Thumbnail Image <span className="text-destructive">*</span>
            </Label>
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

          <div className="space-y-1.5">
            <Label htmlFor="thumbnailAlt">
              Thumbnail Alt Text <span className="text-destructive">*</span>
            </Label>
            <Input
              id="thumbnailAlt"
              placeholder="Describe the thumbnail image"
              {...register("thumbnailAlt")}
            />
            {errors.thumbnailAlt && (
              <p className="text-xs text-destructive">
                {errors.thumbnailAlt.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* SEO */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
            SEO / Meta
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5">
          <div className="space-y-1.5">
            <Label htmlFor="metaTitle">
              Meta Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="metaTitle"
              placeholder="SEO title"
              {...register("metaTitle")}
            />
            {errors.metaTitle && (
              <p className="text-xs text-destructive">
                {errors.metaTitle.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="metaDesc">
              Meta Description <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="metaDesc"
              placeholder="SEO description..."
              rows={3}
              className="resize-none"
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

    </form>
  );
};
