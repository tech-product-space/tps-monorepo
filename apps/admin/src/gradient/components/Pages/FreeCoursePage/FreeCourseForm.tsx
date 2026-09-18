"use client";

import { useCallback, useEffect, useState } from "react";
import { useForm, Controller, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Loader2,
  Plus,
  Trash2,
  BookOpen,
  Users,
  Award,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Textarea } from "@/gradient/components/ui/textarea";
import { Label } from "@/gradient/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import { ImagePickerDialog } from "@/gradient/components/ui/ImagePickerDialog/ImagePickerDialog";
import { resolveStorageUrl } from "@/gradient/lib/storage";
import { uploadFile } from "@/gradient/services/fileUpload";
import { SlugInput } from "@/gradient/components/Common/SlugInput";
import { freeCourseService } from "@/gradient/services/freeCourseService";
import { SampleImagePreview } from "@/gradient/components/Common/SampleImagePreview";
import { cn } from "@/gradient/lib/utils";

// The listing card renders this at 64px and next/image re-encodes it, so the
// source only needs enough detail for a crisp 800x800. The backend's shared
// upload route allows 5 MB for brochures and hero images; thumbnails are held
// tighter here because the raw file is also what social scrapers fetch for the
// course OG image, unoptimised.
const THUMBNAIL_MAX_MB = 1;
const THUMBNAIL_MAX_BYTES = THUMBNAIL_MAX_MB * 1024 * 1024;

const sectionSchema = z.object({
  heading: z.string().optional(),
  points: z.array(z.object({ value: z.string() })).default([]),
});

const freeCourseSchema = z.object({
  title: z.string().min(1, "Title is required"),
  subTitle: z.string().min(1, "Subtitle is required"),
  slug: z.string().min(1, "Slug is required"),
  description: z.string().min(1, "Description is required"),
  thumbnail: z.string().optional(),
  author: z.object({
    name: z.string().optional(),
    company: z.string().optional(),
    designation: z.string().optional(),
    imageKey: z.string().optional(),
    linkedIn: z.string().optional(),
  }),
  whatYouWillLearn: sectionSchema,
  whoShouldAttend: sectionSchema,
  certificate: z.object({
    heading: z.string().optional(),
    imageKey: z.string().optional(),
  }),
  seo: z.object({
    metaTitle: z.string().optional(),
    metaDescription: z.string().optional(),
    metaKeywords: z.string().optional(),
  }),
  rightCard: z.array(z.object({ value: z.string() })).default([]),
  curriculum: z.object({
    heading: z.string().optional(),
    subTitle: z.string().optional(),
  }),
});

export type FreeCourseFormValues = z.infer<typeof freeCourseSchema>;

/**
 * The form is long enough that a plain scroll hides half of it. Each card is an
 * anchor in this list so the rail can jump to it and flag its errors.
 */
const SECTIONS = [
  { id: "course-info", label: "Course Information", keys: ["title", "slug", "subTitle", "description", "thumbnail"] },
  { id: "author", label: "Author", keys: ["author"] },
  { id: "right-card", label: "Right Card", keys: ["rightCard"] },
  { id: "curriculum-headings", label: "Curriculum Headings", keys: ["curriculum"] },
  { id: "what-you-will-learn", label: "What You Will Learn", keys: ["whatYouWillLearn"] },
  { id: "who-should-attend", label: "Who Should Attend", keys: ["whoShouldAttend"] },
  { id: "certificate", label: "Certificate", keys: ["certificate"] },
  { id: "seo", label: "SEO / Meta", keys: ["seo"] },
] as const;

/** Imperative handle the workspace uses to drive the toolbar Save button. */
export interface FreeCourseFormApi {
  save: () => Promise<boolean>;
}

interface FreeCourseFormProps {
  initialValues?: any;
  onSubmit: (values: any) => Promise<void>;
  /** Hands the workspace a save() it can call from the toolbar. */
  onRegister?: (api: FreeCourseFormApi) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export default function FreeCourseForm({
  initialValues,
  onSubmit,
  onRegister,
  onDirtyChange,
}: FreeCourseFormProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isSlugAvailable, setIsSlugAvailable] = useState<boolean | null>(null);
  const [activeSection, setActiveSection] = useState<string>(SECTIONS[0].id);

  const {
    register,
    handleSubmit,
    reset,
    control,
    watch,
    setValue,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FreeCourseFormValues>({
    resolver: zodResolver(freeCourseSchema) as any,
    defaultValues: {
      title: "",
      subTitle: "",
      slug: "",
      description: "",
      thumbnail: "",
      author: {
        name: "",
        company: "",
        designation: "",
        imageKey: "",
        linkedIn: "",
      },
      whatYouWillLearn: {
        heading: "",
        points: [{ value: "" }, { value: "" }, { value: "" }, { value: "" }],
      },
      whoShouldAttend: {
        heading: "",
        points: [{ value: "" }, { value: "" }, { value: "" }, { value: "" }],
      },
      certificate: {
        heading: "",
        imageKey: "",
      },
      seo: {
        metaTitle: "",
        metaDescription: "",
        metaKeywords: "",
      },
      rightCard: [
        { value: "" },
        { value: "" },
        { value: "" },
        { value: "" },
        { value: "" },
      ],
      curriculum: {
        heading: "",
        subTitle: "",
      },
    },
  });

  const currentThumbnail = watch("thumbnail");
  const currentCertificateImage = watch("certificate.imageKey");
  const currentSlug = watch("slug");

  const {
    fields: learnFields,
    append: appendLearn,
    remove: removeLearn,
  } = useFieldArray({
    control: control as any,
    name: "whatYouWillLearn.points" as any,
  });

  const {
    fields: attendFields,
    append: appendAttend,
    remove: removeAttend,
  } = useFieldArray({
    control: control as any,
    name: "whoShouldAttend.points" as any,
  });

  const { fields: rightCardFields } = useFieldArray({
    control: control as any,
    name: "rightCard" as any,
  });

  useEffect(() => {
    if (initialValues) {
      const transformedValues = {
        ...initialValues,
        author: {
          name: initialValues.author?.name || "",
          company: initialValues.author?.company || "",
          designation: initialValues.author?.designation || "",
          imageKey: initialValues.author?.imageKey || "",
          linkedIn: initialValues.author?.linkedIn || "",
        },
        whatYouWillLearn: {
          heading:
            initialValues.whatYouWillLearn?.heading || "What You'll Learn",
          points: initialValues.whatYouWillLearn?.points?.length
            ? initialValues.whatYouWillLearn.points.map((p: string) => ({
                value: p,
              }))
            : [{ value: "" }, { value: "" }, { value: "" }, { value: "" }],
        },
        whoShouldAttend: {
          heading:
            initialValues.whoShouldAttend?.heading || "Who Should Attend",
          points: initialValues.whoShouldAttend?.points?.length
            ? initialValues.whoShouldAttend.points.map((p: string) => ({
                value: p,
              }))
            : [{ value: "" }, { value: "" }, { value: "" }, { value: "" }],
        },
        certificate: {
          heading:
            initialValues.certificate?.heading || "Certificate of Completion",
          imageKey: initialValues.certificate?.imageKey || "",
        },
        seo: {
          metaTitle: initialValues.seo?.metaTitle || "",
          metaDescription: initialValues.seo?.metaDescription || "",
          metaKeywords: initialValues.seo?.metaKeywords || "",
        },
        thumbnail: initialValues.thumbnail || "",
        rightCard:
          initialValues.rightCard && typeof initialValues.rightCard === "object"
            ? Array.from({ length: 5 }).map((_, i) => ({
                value: (initialValues.rightCard as any)[i] || "",
              }))
            : [
                { value: "" },
                { value: "" },
                { value: "" },
                { value: "" },
                { value: "" },
              ],
        curriculum: {
          heading: initialValues.curriculum?.heading || "",
          subTitle: initialValues.curriculum?.subTitle || "",
        },
      };
      reset(transformedValues);
    }
  }, [initialValues, reset]);

  const handleThumbnailUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check for slug as it's used as entityId
    if (!currentSlug) {
      toast.error("Please enter a slug first to upload the thumbnail.");
      e.target.value = "";
      return;
    }

    // Caught here rather than server-side so an oversized file fails at once
    // instead of after uploading in full. An 800x800 export lands well under
    // this; anything over is an unresized original.
    if (file.size > THUMBNAIL_MAX_BYTES) {
      toast.error(
        `That image is ${(file.size / 1024 / 1024).toFixed(1)} MB. Resize it to 800x800 and keep it under ${THUMBNAIL_MAX_MB} MB.`,
      );
      e.target.value = "";
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading("Uploading thumbnail...");

    try {
      // Use course ID if editing, otherwise use slug for creation
      const entityId = initialValues?.id || currentSlug;
      const key = await uploadFile(file, "free-course", entityId);
      setValue("thumbnail", key, { shouldValidate: true });
      toast.success("Thumbnail uploaded successfully", { id: toastId });
    } catch (error) {
      console.error("Thumbnail upload failed:", error);
      toast.error("Failed to upload thumbnail. Please try again.", {
        id: toastId,
      });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const handleCertificateUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!currentSlug) {
      toast.error("Please enter a slug first to upload the certificate.");
      e.target.value = "";
      return;
    }

    setIsUploading(true);
    const toastId = toast.loading("Uploading certificate...");

    try {
      const entityId = initialValues?.id || currentSlug;
      const key = await uploadFile(file, "free-course", entityId);
      setValue("certificate.imageKey", key, { shouldValidate: true });
      toast.success("Certificate uploaded successfully", { id: toastId });
    } catch (error) {
      console.error("Certificate upload failed:", error);
      toast.error("Failed to upload certificate. Please try again.", {
        id: toastId,
      });
    } finally {
      setIsUploading(false);
      e.target.value = "";
    }
  };

  const scrollToSection = useCallback((id: string) => {
    document.getElementById(id)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    setActiveSection(id);
  }, []);

  // Highlight whichever section is currently under the top of the viewport.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible[0]) setActiveSection(visible[0].target.id);
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );

    SECTIONS.forEach(({ id }) => {
      const element = document.getElementById(id);
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const handleFormSubmit = async (data: FreeCourseFormValues) => {
    const finalData = {
      ...data,
      whatYouWillLearn: {
        ...data.whatYouWillLearn,
        points: data.whatYouWillLearn.points
          .map((p) => p.value)
          .filter((p) => p.trim() !== ""),
      },
      whoShouldAttend: {
        ...data.whoShouldAttend,
        points: data.whoShouldAttend.points
          .map((p) => p.value)
          .filter((p) => p.trim() !== ""),
      },
      rightCard: data.rightCard.reduce((acc: any, curr, idx) => {
        acc[idx] = curr.value;
        return acc;
      }, {}),
    };
    await onSubmit(finalData);
    // Saved values become the new baseline, so the Save button goes quiet.
    reset(data, { keepValues: true });
  };

  const onInvalid = (validationErrors: any) => {
    console.error("Form Validation Errors:", validationErrors);

    // Point at the problem instead of leaving it somewhere in 1,000px of scroll.
    const failed = SECTIONS.find((section) =>
      section.keys.some((key) => key in validationErrors),
    );

    if (failed) {
      scrollToSection(failed.id);
      toast.error(`Fix the errors in ${failed.label} before saving.`);
    } else {
      toast.error("Please fill all the required fields.");
    }
  };

  // Expose save() to the workspace toolbar; resolves false when validation fails.
  const save = useCallback(
    () =>
      new Promise<boolean>((resolve) => {
        handleSubmit(
          async (data) => {
            try {
              await handleFormSubmit(data);
              resolve(true);
            } catch {
              // onSubmit already surfaced the failure as a toast.
              resolve(false);
            }
          },
          (validationErrors) => {
            onInvalid(validationErrors);
            resolve(false);
          },
        )();
      }),
    // handleSubmit is stable; the closures it wraps read current state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleSubmit],
  );

  useEffect(() => {
    onRegister?.({ save });
  }, [onRegister, save]);

  const sectionHasError = (keys: readonly string[]) =>
    keys.some((key) => key in errors);

  return (
    <form
      onSubmit={handleSubmit(handleFormSubmit, onInvalid)}
      className="flex items-start gap-6"
    >
      {/* Section rail — the form is long, so jumping beats scrolling. */}
      <nav className="sticky top-4 hidden w-56 shrink-0 lg:block">
        <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Sections
        </p>
        <ul className="space-y-0.5">
          {SECTIONS.map((section) => {
            const hasError = sectionHasError(section.keys);
            return (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => scrollToSection(section.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    activeSection === section.id
                      ? "bg-white font-medium text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-white/60 hover:text-foreground",
                  )}
                >
                  <span className="truncate">{section.label}</span>
                  {hasError && (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive"
                      aria-label="Has errors"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="min-w-0 flex-1 space-y-6 pb-10">
      {/* Course Information */}
      <Card id="course-info" className="scroll-mt-6">
        <CardHeader>
          <CardTitle>Course Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              placeholder="e.g. Introduction to React"
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
                placeholder="e.g. intro-to-react"
                initialSlug={initialValues?.slug}
                checkService={freeCourseService.checkSlugAvailability}
                error={errors.slug?.message}
                onAvailabilityChange={setIsSlugAvailable}
              />
            )}
          />

          <div className="space-y-2">
            <Label htmlFor="subTitle">Subtitle</Label>
            <Input
              id="subTitle"
              placeholder="e.g. Master the basics of React in 5 hours"
              {...register("subTitle")}
            />
            {errors.subTitle && (
              <p className="text-xs text-destructive">
                {errors.subTitle.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              placeholder="Tell us about this course..."
              rows={6}
              {...register("description")}
            />
            {errors.description && (
              <p className="text-xs text-destructive">
                {errors.description.message}
              </p>
            )}
          </div>

          {/* Thumbnail Upload */}
          <div className="space-y-2">
            <Label>
              Thumbnail Image{" "}
              <span className="text-red-400">
                (Max {THUMBNAIL_MAX_MB} MB)
              </span>
            </Label>
            {/* Only consumer is the square tile on the course listing card. */}
            <p className="text-xs text-muted-foreground">
              Upload a <strong>square 1:1 image — 800×800px</strong> (400×400
              minimum). It is shown as a square tile on the course listing card,
              so keep the logo or subject centred. Wide banners will be cut off
              on the sides. Aim for roughly 200 KB — export as WebP or JPEG at
              about 80% quality, or PNG for flat logo art.
            </p>
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Input
                  type="file"
                  accept="image/*"
                  onChange={handleThumbnailUpload}
                  disabled={isUploading}
                  className="w-fit cursor-pointer"
                />
                {isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
              </div>
              {currentThumbnail && (
                <div className="space-y-2">
                  {/* Square preview — the crop the listing card actually uses. */}
                  <div className="relative h-[220px] w-[220px] overflow-hidden rounded-md border bg-muted">
                    <img
                      src={resolveStorageUrl(currentThumbnail)}
                      alt="Thumbnail Preview"
                      className="h-full w-full object-cover"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6"
                      onClick={() => setValue("thumbnail", "")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Listing card (1:1)
                  </p>
                </div>
              )}
            </div>
            {errors.thumbnail && (
              <p className="text-xs text-destructive">
                {errors.thumbnail.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Author Section */}
      <Card id="author" className="scroll-mt-6">
        <CardHeader>
          <CardTitle>Author Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="authorName">Name</Label>
            <Input
              id="authorName"
              placeholder="Author name"
              {...register("author.name")}
            />
            {errors.author?.name && (
              <p className="text-xs text-destructive">
                {errors.author.name.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="authorCompany">Company</Label>
            <Input
              id="authorCompany"
              placeholder="Company name"
              {...register("author.company")}
            />
            {errors.author?.company && (
              <p className="text-xs text-destructive">
                {errors.author.company.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="authorDesignation">Designation</Label>
            <Input
              id="authorDesignation"
              placeholder="e.g. Senior Software Engineer"
              {...register("author.designation")}
            />
            {errors.author?.designation && (
              <p className="text-xs text-destructive">
                {errors.author.designation.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="authorLinkedIn">LinkedIn URL (Optional)</Label>
            <Input
              id="authorLinkedIn"
              placeholder="https://linkedin.com/in/..."
              {...register("author.linkedIn")}
            />
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Author Image</Label>
            <Controller
              name="author.imageKey"
              control={control}
              render={({ field }) => (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Image key"
                      {...field}
                      readOnly
                      className="bg-muted"
                    />
                    <ImagePickerDialog
                      onSelect={(key) => field.onChange(key)}
                    />
                  </div>
                  {field.value && (
                    <div className="mt-2">
                      <img
                        src={resolveStorageUrl(field.value)}
                        alt="Author Preview"
                        className="w-20 h-auto rounded-md object-cover border"
                      />
                    </div>
                  )}
                </div>
              )}
            />
            {errors.author?.imageKey && (
              <p className="text-xs text-destructive">
                {errors.author.imageKey.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Right Card Section */}
      <Card id="right-card" className="scroll-mt-6">
        <CardHeader className="flex flex-row items-center gap-4">
          <CardTitle>Right Card Details</CardTitle>
          <SampleImagePreview
            imagePath="/free-course/right-card.webp"
            title="Right Card Details"
          />
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="rightCard0">Modules</Label>
            <Input
              id="rightCard0"
              placeholder="e.g. 11 Modules"
              {...register("rightCard.0.value" as any)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rightCard1">Duration</Label>
            <Input
              id="rightCard1"
              placeholder="e.g. 8 Hour 36 Minutes"
              {...register("rightCard.1.value" as any)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rightCard2">Lessons</Label>
            <Input
              id="rightCard2"
              placeholder="e.g. 72 Lessons"
              {...register("rightCard.2.value" as any)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rightCard3">Challenges</Label>
            <Input
              id="rightCard3"
              placeholder="e.g. 72 Challenges"
              {...register("rightCard.3.value" as any)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="rightCard4">Language</Label>
            <Input
              id="rightCard4"
              placeholder="e.g. Language: English"
              {...register("rightCard.4.value" as any)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Curriculum Section */}
      <Card id="curriculum-headings" className="scroll-mt-6">
        <CardHeader className="flex flex-row items-center gap-4">
          <CardTitle>Curriculum Headings</CardTitle>
          <SampleImagePreview
            imagePath="/free-course/curicullum-header.png"
            title="Curriculum Headings"
          />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="currHeading">Heading</Label>
            <Input
              id="currHeading"
              placeholder="e.g. Curriculum"
              {...register("curriculum.heading")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="currSubTitle">Subtitle</Label>
            <Textarea
              id="currSubTitle"
              placeholder="A brief overview of the curriculum..."
              rows={3}
              {...register("curriculum.subTitle")}
            />
          </div>
        </CardContent>
      </Card>

      {/* What You Will Learn Section */}
      <Card id="what-you-will-learn" className="scroll-mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-muted-foreground" />
              <CardTitle>What You Will Learn</CardTitle>
            </div>
            <SampleImagePreview
              imagePath="/free-course/what-you-will-walk-away-with.png"
              title="What You Will Learn"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => appendLearn({ value: "" })}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Point
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Heading</Label>
            <Input
              placeholder="e.g. What You'll Learn"
              {...register("whatYouWillLearn.heading")}
            />
            {errors.whatYouWillLearn?.heading && (
              <p className="text-xs text-destructive">
                {errors.whatYouWillLearn.heading.message}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Label>Points</Label>
            {learnFields.map((field, index) => (
              <div key={field.id} className="flex gap-2">
                <Input
                  {...register(`whatYouWillLearn.points.${index}.value` as any)}
                  placeholder={`Point ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => removeLearn(index)}
                  disabled={learnFields.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Who Should Attend Section */}
      <Card id="who-should-attend" className="scroll-mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <CardTitle>Who Should Attend</CardTitle>
            </div>
            <SampleImagePreview
              imagePath="/free-course/who-should-attend.png"
              title="Who Should Attend"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => appendAttend({ value: "" })}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Point
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>Heading</Label>
            <Input
              placeholder="e.g. Who Should Attend"
              {...register("whoShouldAttend.heading")}
            />
            {errors.whoShouldAttend?.heading && (
              <p className="text-xs text-destructive">
                {errors.whoShouldAttend.heading.message}
              </p>
            )}
          </div>

          <div className="space-y-3">
            <Label>Points</Label>
            {attendFields.map((field, index) => (
              <div key={field.id} className="flex gap-2">
                <Input
                  {...register(`whoShouldAttend.points.${index}.value` as any)}
                  placeholder={`Point ${index + 1}`}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => removeAttend(index)}
                  disabled={attendFields.length === 1}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Certificate Section */}
      <Card id="certificate" className="scroll-mt-6">
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-muted-foreground" />
            <CardTitle>Certificate Details</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="space-y-2">
              <Label htmlFor="certHeading">Certificate Heading</Label>
              <Input
                id="certHeading"
                placeholder="e.g. Certificate of Completion"
                {...register("certificate.heading")}
              />
              {errors.certificate?.heading && (
                <p className="text-xs text-destructive">
                  {errors.certificate.heading.message}
                </p>
              )}
            </div>

            <div className="space-y-2 mt-5">
              <Label>
                Certificate Image{" "}
                <span className="text-red-400">(Keep it under 4 MB)</span>
              </Label>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={handleCertificateUpload}
                    disabled={isUploading}
                    className="w-fit cursor-pointer"
                  />
                  {isUploading && <Loader2 className="h-4 w-4 animate-spin" />}
                </div>
                {currentCertificateImage && (
                  <div className="relative max-w-[400px] max-h-[300px] border rounded-md overflow-hidden bg-muted flex items-center justify-center">
                    <img
                      src={resolveStorageUrl(currentCertificateImage)}
                      alt="Certificate Preview"
                      className="max-h-[300px] w-auto object-contain"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6"
                      onClick={() => setValue("certificate.imageKey", "")}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
            {errors.certificate?.imageKey && (
              <p className="text-xs text-destructive">
                {errors.certificate.imageKey.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* SEO Section */}
      <Card id="seo" className="scroll-mt-6">
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
              placeholder="SEO title"
              {...register("seo.metaTitle")}
            />
            {errors.seo?.metaTitle && (
              <p className="text-xs text-destructive">
                {errors.seo.metaTitle.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="metaDescription">Meta Description</Label>
            <Textarea
              id="metaDescription"
              placeholder="SEO description"
              rows={3}
              {...register("seo.metaDescription")}
            />
            {errors.seo?.metaDescription && (
              <p className="text-xs text-destructive">
                {errors.seo.metaDescription.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="metaKeywords">Meta Keywords</Label>
            <Input
              id="metaKeywords"
              placeholder="e.g. react, javascript, coding"
              {...register("seo.metaKeywords")}
            />
            {errors.seo?.metaKeywords && (
              <p className="text-xs text-destructive">
                {errors.seo.metaKeywords.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end gap-3 pb-4">
        {isSlugAvailable === false && (
          <p className="text-xs text-destructive">
            This slug is taken — pick another before saving.
          </p>
        )}
        <Button
          type="submit"
          disabled={isSubmitting || isSlugAvailable === false}
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
      </div>
    </form>
  );
}
