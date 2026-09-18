"use client";

import { useForm, useFieldArray, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { EventResponse } from "@/gradient/types/event";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { Button } from "@/gradient/components/ui/button";
import { Textarea } from "@/gradient/components/ui/textarea";
import { eventService } from "@/gradient/services/eventService";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
import { EVENT_CATEGORIES } from "@/gradient/components/constants/eventCategories";
import { EVENT_TYPES } from "@/gradient/components/constants/eventTypes";
import {
  Loader2,
  Check,
  X,
  Plus,
  Trash2,
  Target,
  BookOpen,
  Users,
  Info,
} from "lucide-react";
import { useSlugAvailability } from "@/gradient/hooks/useSlugAvailability";
import { uploadFile } from "@/gradient/services/fileUpload";
import { resolveStorageUrl } from "@/gradient/lib/storage";
import { Badge } from "@/gradient/components/ui/badge";
import { useState } from "react";
import { ImagePickerDialog } from "../../../../ui/ImagePickerDialog/ImagePickerDialog";

// ─── Schema ───────────────────────────────────────────────────────────────────

const speakerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  company: z.string().min(1, "Company is required"),
  designation: z.string().min(1, "Designation is required"),
  speakerBio: z.string().min(1, "Bio is required"),
  imageKey: z.string().min(1, "Image is required"),
});

const eventSchema = z.object({
  eventTitle: z.string().min(1, "Title is required"),
  eventSubtitle: z.string().optional(),
  eventCategory: z.string().min(1, "Category is required"),
  eventType: z.string().min(1, "Event type is required"),
  eventSlug: z.string().min(1, "URL slug is required"),
  eventStartDate: z.string().optional(),
  eventEndDate: z.string().optional(),
  eventStartTime: z.string().optional(),
  eventEndTime: z.string().optional(),
  numberOfAttendees: z.coerce.number().optional().nullable(),
  eventCreativeUrl: z.string().optional().nullable(),
  ctaType: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  locationType: z.string().optional().nullable(),
  tags: z.string().optional(),
  metaTitle: z.string().optional(),
  metaDesc: z.string().optional(),
  speakers: z.array(speakerSchema),
  walkAway: z
    .object({
      title: z.string().optional(),
      points: z.array(z.string()).default([]),
    })
    .default({ title: "You'll Walk Away With:", points: [] }),
  whatYoullLearn: z
    .object({
      title: z.string().optional(),
      items: z
        .array(
          z.object({
            title: z.string().min(1, "Title is required"),
            description: z.string().optional(),
          }),
        )
        .default([]),
    })
    .default({ title: "WHAT YOU'LL LEARN", items: [] }),
  whoShouldJoin: z
    .object({
      title: z.string().optional(),
      items: z
        .array(
          z.object({
            title: z.string().min(1, "Title is required"),
            description: z.string().min(1, "Description is required"),
          }),
        )
        .default([]),
    })
    .default({ title: "WHO SHOULD JOIN", items: [] }),
  whyTopicMatters: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
    })
    .default({ title: "WHY THIS TOPIC MATTERS", description: "" }),
  whatsappGroupLink: z.string().optional(),
});

type EventFormValues = z.infer<typeof eventSchema>;

// ─── Component ────────────────────────────────────────────────────────────────

interface EventDetailPageProps {
  event: EventResponse;
}

export const EventDetailPage = ({ event }: EventDetailPageProps) => {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventSchema) as Resolver<EventFormValues>,
    defaultValues: {
      eventTitle: event.eventTitle || "",
      eventSubtitle: event.eventSubtitle || "",
      eventCategory: event.eventCategory || "",
      eventType: event.eventType || "",
      eventSlug: event.eventSlug || "",
      eventStartDate: event.eventStartDate
        ? event.eventStartDate.slice(0, 10)
        : "",
      eventEndDate: event.eventEndDate ? event.eventEndDate.slice(0, 10) : "",
      eventStartTime: event.eventStartTime || "",
      eventEndTime: event.eventEndTime || "",
      numberOfAttendees: event.numberOfAttendees || null,
      eventCreativeUrl: event.eventCreativeUrl || "",
      ctaType: event.ctaType || "",
      location: event.location || "",
      locationType: event.locationType || "",
      tags: event.tags?.join(", ") || "",
      metaTitle: event.seo?.metaTitle || "",
      metaDesc: event.seo?.metaDesc || "",
      speakers: event.speakers || [],
      walkAway: {
        title: event.eventDetails?.walkAway?.title || "You'll Walk Away With:",
        points: event.eventDetails?.walkAway?.points || [],
      },
      whatYoullLearn: {
        title: event.eventDetails?.whatYoullLearn?.title || "WHAT YOU'LL LEARN",
        items: event.eventDetails?.whatYoullLearn?.items || [],
      },
      whoShouldJoin: {
        title: event.eventDetails?.whoShouldJoin?.title || "WHO SHOULD JOIN",
        items: event.eventDetails?.whoShouldJoin?.items || [],
      },
      whyTopicMatters: {
        title:
          event.eventDetails?.whyTopicMatters?.title ||
          "WHY THIS TOPIC MATTERS",
        description: event.eventDetails?.whyTopicMatters?.description || "",
      },
      whatsappGroupLink: event.eventDetails?.whatsappGroupLink || "",
    },
  });

  const [currentPoint, setCurrentPoint] = useState("");

  const {
    fields: speakerFields,
    append: appendSpeaker,
    remove: removeSpeaker,
  } = useFieldArray({
    control,
    name: "speakers",
  });

  const {
    fields: learnFields,
    append: appendLearn,
    remove: removeLearn,
  } = useFieldArray({
    control,
    name: "whatYoullLearn.items",
  });

  const {
    fields: joinFields,
    append: appendJoin,
    remove: removeJoin,
  } = useFieldArray({
    control,
    name: "whoShouldJoin.items",
  });

  const handleCategoryChange = (value: string) => {
    setValue("eventCategory", value, { shouldValidate: true });
  };

  const handleTypeChange = (value: string) => {
    setValue("eventType", value, { shouldValidate: true });
  };

  const currentSlug = watch("eventSlug");
  const isOriginalSlug = currentSlug === event.eventSlug;
  const { slugAvailable: fetchedSlugAvailable, checkingSlug } =
    useSlugAvailability(
      isOriginalSlug ? "" : currentSlug,
      eventService.checkSlugAvailability,
    );
  const slugAvailable = isOriginalSlug ? true : fetchedSlugAvailable;

  const onSubmit = async (values: EventFormValues) => {
    const toastId = toast.loading("Updating event...");

    try {
      if (!event?.id) {
        toast.error("Event ID is missing", { id: toastId });
        return;
      }

      const payload: Partial<EventResponse> = {
        eventTitle: values.eventTitle,
        eventSubtitle: values.eventSubtitle,
        eventCategory: values.eventCategory,
        eventType: values.eventType,
        eventSlug: values.eventSlug,
        eventStartDate: values.eventStartDate,
        eventEndDate: values.eventEndDate,
        eventStartTime: values.eventStartTime,
        eventEndTime: values.eventEndTime,
        numberOfAttendees: values.numberOfAttendees || undefined,
        eventCreativeUrl: values.eventCreativeUrl || undefined,
        ctaType: values.ctaType || undefined,
        location: values.location || undefined,
        locationType: values.locationType || undefined,
        tags: values.tags
          ?.split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        seo: {
          metaTitle: values.metaTitle || "",
          metaDesc: values.metaDesc || "",
        },
        speakers: values.speakers,
        eventDetails: {
          ...event.eventDetails,
          walkAway: values.walkAway,
          whatYoullLearn: values.whatYoullLearn,
          whoShouldJoin: values.whoShouldJoin,
          whyTopicMatters: values.whyTopicMatters,
          whatsappGroupLink: values.whatsappGroupLink,
        },
      };

      await eventService.updateEvent(event.id, payload);
      toast.success("Event updated successfully", { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error("Failed to update event", { id: toastId });
    }
  };

  const addPoint = () => {
    if (!currentPoint.trim()) return;
    const points = watch("walkAway.points") || [];
    setValue("walkAway.points", [...points, currentPoint.trim()], {
      shouldValidate: true,
    });
    setCurrentPoint("");
  };

  const removePoint = (index: number) => {
    const points = watch("walkAway.points") || [];
    setValue(
      "walkAway.points",
      points.filter((_, i) => i !== index),
      { shouldValidate: true },
    );
  };

  const handleCreativeUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading("Uploading event creative...");
    try {
      const key = await uploadFile(file, "event", `${event.id}-creative`);
      setValue("eventCreativeUrl", key, { shouldValidate: true });
      toast.success("Image uploaded successfully", { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error("Please upload the image under 4 Mb", { id: toastId });
    }
  };

  const creativeUrl = watch("eventCreativeUrl");

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6 w-full">
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
            Core Information
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5">
          <div className="space-y-1.5">
            <Label htmlFor="eventTitle">Title</Label>
            <Input
              id="eventTitle"
              placeholder="Enter event title"
              {...register("eventTitle")}
            />
            {errors.eventTitle && (
              <p className="text-xs text-destructive">
                {errors.eventTitle.message}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="eventSubtitle">Subtitle</Label>
            <Input
              id="eventSubtitle"
              placeholder="Enter subtitle"
              {...register("eventSubtitle")}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="eventCategory">Category</Label>
              <Select
                value={watch("eventCategory")}
                onValueChange={handleCategoryChange}
              >
                <SelectTrigger id="eventCategory" className="w-full">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.eventCategory && (
                <p className="text-xs text-destructive">
                  {errors.eventCategory.message}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="eventType">Type</Label>
              <Select
                value={watch("eventType")}
                onValueChange={handleTypeChange}
              >
                <SelectTrigger id="eventType" className="w-full">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.eventType && (
                <p className="text-xs text-destructive">
                  {errors.eventType.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="eventSlug">URL Slug</Label>
            <div className="relative">
              <Input
                id="eventSlug"
                placeholder="event-slug"
                className={`${
                  slugAvailable === false
                    ? "border-red-500 focus-visible:ring-red-500 pr-10"
                    : slugAvailable === true
                      ? "border-green-500 focus-visible:ring-green-500 pr-10"
                      : "pr-10"
                }`}
                {...register("eventSlug")}
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
            {errors.eventSlug && (
              <p className="text-xs text-destructive">
                {errors.eventSlug.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
            Schedule & Location
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <Label htmlFor="eventStartDate">Start Date</Label>
            <Input
              id="eventStartDate"
              type="date"
              {...register("eventStartDate")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eventEndDate">End Date</Label>
            <Input
              id="eventEndDate"
              type="date"
              {...register("eventEndDate")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eventStartTime">Start Time</Label>
            <Input
              id="eventStartTime"
              type="time"
              {...register("eventStartTime")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="eventEndTime">End Time</Label>
            <Input
              id="eventEndTime"
              type="time"
              {...register("eventEndTime")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="locationType">Location Type</Label>
            <Select
              value={watch("locationType") || ""}
              onValueChange={(val) => setValue("locationType", val)}
            >
              <SelectTrigger id="locationType" className="w-full">
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Online">Online</SelectItem>
                <SelectItem value="Offline">Offline</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="location">Location / Link</Label>
            <Input
              id="location"
              placeholder="Address or Meeting Link"
              {...register("location")}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
            Event Metadata
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-1.5">
            <Label htmlFor="numberOfAttendees">Max Attendees</Label>
            <Input
              id="numberOfAttendees"
              type="number"
              placeholder="0"
              {...register("numberOfAttendees")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ctaType">CTA Type</Label>
            <Input
              id="ctaType"
              placeholder="e.g. Register Now"
              {...register("ctaType")}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="whatsappGroupLink">WhatsApp Group Link</Label>
            <Input
              id="whatsappGroupLink"
              placeholder="Enter the Whatsapp Group Link"
              {...register("whatsappGroupLink")}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="tags">Tags (comma-separated)</Label>
            <Input
              id="tags"
              placeholder="Webinar, Design, Workshop"
              {...register("tags")}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Event Creative</Label>

            <div className="flex flex-col gap-3">
              <Input
                type="file"
                accept="image/*"
                onChange={handleCreativeUpload}
                className="w-fit cursor-pointer"
              />

              {creativeUrl && (
                <img
                  src={resolveStorageUrl(creativeUrl)}
                  alt="creative"
                  className="w-[400px] h-auto object-cover rounded border"
                />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
            Speakers
          </CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              appendSpeaker({
                name: "",
                company: "",
                designation: "",
                speakerBio: "",
                imageKey: "",
              })
            }
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Speaker
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {speakerFields.map((field, index) => (
            <div
              key={field.id}
              className="p-4 border rounded-lg bg-muted/30 relative"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 text-destructive hover:text-destructive"
                onClick={() => removeSpeaker(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    {...register(`speakers.${index}.name`)}
                    placeholder="Speaker name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Company</Label>
                  <Input
                    {...register(`speakers.${index}.company`)}
                    placeholder="Company"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Designation</Label>
                  <Input
                    {...register(`speakers.${index}.designation`)}
                    placeholder="Designation"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Image Key</Label>

                  <div className="flex items-center gap-2">
                    <Input
                      {...register(`speakers.${index}.imageKey`)}
                      placeholder="Image key"
                      readOnly
                    />

                    <ImagePickerDialog
                      onSelect={(key) => {
                        setValue(`speakers.${index}.imageKey`, key);
                      }}
                    />
                  </div>

                  {watch(`speakers.${index}.imageKey`) && (
                    <img
                      src={resolveStorageUrl(
                        watch(`speakers.${index}.imageKey`),
                      )}
                      alt="speaker"
                      className="w-20 h-auto rounded-md object-cover mt-2 border"
                    />
                  )}
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Speaker Bio</Label>
                  <Textarea
                    {...register(`speakers.${index}.speakerBio`)}
                    placeholder="Speaker bio"
                  />
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
            SEO / Meta Tags
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-5">
          <div className="space-y-1.5">
            <Label htmlFor="metaTitle">Meta Title</Label>
            <Input
              id="metaTitle"
              placeholder="SEO title"
              {...register("metaTitle")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="metaDesc">Meta Description</Label>
            <Textarea
              id="metaDesc"
              placeholder="SEO description..."
              rows={3}
              {...register("metaDesc")}
            />
          </div>
        </CardContent>
      </Card>

      {/* What You'll Learn */}
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
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea
                    {...register(`whatYoullLearn.items.${index}.description`)}
                    placeholder="e.g. The instinct you only develop..."
                    rows={2}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Why This Topic Matters */}
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

      {/* You'll Walk Away With */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2">
          <Target className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
            You'll Walk Away With
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="walkAwayTitle">Section Name</Label>
            <Input
              id="walkAwayTitle"
              placeholder="e.g. You'll Walk Away With:"
              {...register("walkAway.title")}
            />
          </div>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Bullet point"
                value={currentPoint}
                onChange={(e) => setCurrentPoint(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addPoint();
                  }
                }}
              />
              <Button
                type="button"
                size="icon"
                onClick={addPoint}
                className="shrink-0 bg-black hover:bg-black/90"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {(watch("walkAway.points") || []).map((point, index) => (
                <Badge
                  key={index}
                  variant="secondary"
                  className="bg-muted px-3 py-1.5 h-auto text-[13px] font-normal flex items-center gap-2 rounded-md border-none"
                >
                  {point}
                  <button
                    type="button"
                    onClick={() => removePoint(index)}
                    className="hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Who Should Join */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
              Who Should Join
            </CardTitle>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => appendJoin({ title: "", description: "" })}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Item
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-1.5">
            <Label htmlFor="joinTitle">Section Name</Label>
            <Input
              id="joinTitle"
              placeholder="e.g. WHO SHOULD JOIN"
              {...register("whoShouldJoin.title")}
            />
          </div>

          <div className="space-y-4">
            {joinFields.map((field, index) => (
              <div
                key={field.id}
                className="p-4 border rounded-lg bg-muted/30 relative space-y-3"
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-2 right-2 text-destructive hover:text-destructive"
                  onClick={() => removeJoin(index)}
                >
                  <X className="h-4 w-4" />
                </Button>
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input
                    {...register(`whoShouldJoin.items.${index}.title`)}
                    placeholder="e.g. Builders, founders, and operators"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea
                    {...register(`whoShouldJoin.items.${index}.description`)}
                    placeholder="e.g. looking to validate ideas quickly..."
                    rows={2}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end pb-6">
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
