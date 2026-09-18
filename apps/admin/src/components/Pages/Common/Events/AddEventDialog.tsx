"use client";

import type React from "react";

import { useEffect, useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import {
  checkSlugAvailability,
  createEvents,
  deleteEventFile,
  uploadEventImage,
} from "@/services/Events/eventServices";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import type { IEvent } from "./Events";
import { useNotification } from "@/helpers/NotificationContext";

const speakerSchema = z.object({
  name: z.string().min(1, "Speaker name is required"),
  company: z.string().min(1, "Company is required"),
  designation: z.string().min(1, "Designation is required"),
});

const eventSchema = z.object({
  eventTitle: z.string().min(1, "Event title is required"),
  eventSubtitle: z.string().min(1, "Event subtitle is required"),
  eventStartDate: z.string().min(1, "Start date is required"),
  eventEndDate: z.string().min(1, "End date is required"),
  eventStartTime: z.string().optional(),
  eventEndTime: z.string().optional(),
  eventType: z.enum(["Teardown", "Hackathon", "Workshop"]),
  speakers: z.array(speakerSchema).min(1, "At least one speaker is required"),
  numberOfAttendees: z.number().min(0, "Number of attendees must be positive"),
  eventCreativeUrl: z.string().min(1, "Event banner is required"),
  tags: z.array(z.string()).min(1, "At least one tag is required"),
  locationType: z.string().min(1, "Location Type is required"),
  location: z.string().optional(),
  eventSlug: z.string().min(2, "Event URL is required"),
  eventCategory: z.enum([
    "Community",
    "Normal",
    "MicroCertificate",
    "GenAiMicroCertificate",
    "Claude",
    "ClaudeOneDay",
    "InternalCohort",
  ]),
});

type EventFormData = z.infer<typeof eventSchema>;

interface AddEventDialogProps {
  onSubmit: (event: Omit<IEvent, "id">) => void;
  pageRefresh: () => void;
}

export function AddEventDialog({ onSubmit, pageRefresh }: AddEventDialogProps) {
  const [newTag, setNewTag] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showNotification } = useNotification();

  const [slugAvailable, setSlugAvailable] = useState<null | boolean>(null);
  const [slugMessage, setSlugMessage] = useState("");
  const [slugLoading, setSlugLoading] = useState(false);

  const getCTAType = (
    eventType: "Teardown" | "Hackathon" | "Workshop",
  ): "Join Waitlist" | "Register Now" => {
    return eventType === "Workshop" ? "Join Waitlist" : "Register Now";
  };

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      eventTitle: "",
      eventSubtitle: "",
      eventStartDate: "",
      eventEndDate: "",
      eventStartTime: "",
      eventEndTime: "",
      eventType: "Workshop",
      speakers: [{ name: "", company: "", designation: "" }],
      numberOfAttendees: 0,
      eventCreativeUrl: "",
      tags: [],
      location: "",
      locationType: "",
      eventSlug: "",
      eventCategory: "Normal",
    },
  });

  const {
    fields: speakerFields,
    append: appendSpeaker,
    remove: removeSpeaker,
  } = useFieldArray({ control: form.control, name: "speakers" });

  const watchSlug = form.watch("eventSlug");
  const watchCategory = form.watch("eventCategory");
  const isInternalCohort = watchCategory === "InternalCohort";

  // Internal Cohort Sessions are always of type "Workshop"
  useEffect(() => {
    if (isInternalCohort) {
      form.setValue("eventType", "Workshop");
    }
  }, [isInternalCohort]);

  useEffect(() => {
    if (!watchSlug || watchSlug.trim() === "") {
      setSlugAvailable(null);
      setSlugMessage("");
      return;
    }

    const timer = setTimeout(async () => {
      setSlugLoading(true);
      try {
        const res = await checkSlugAvailability(watchSlug);
        setSlugAvailable(res.available);
        setSlugMessage(res.message);
      } catch (error) {
        setSlugAvailable(null);
        setSlugMessage("Error checking slug availability");
      } finally {
        setSlugLoading(false);
      }
    }, 600); // debounce API call

    return () => clearTimeout(timer);
  }, [watchSlug]);

  const handleSubmit = async (data: EventFormData) => {
    setLoading(true);
    setError(null);

    const eventData = {
      ...data,
      ctaType: getCTAType(data.eventType),
    };

    try {
      const res = await createEvents(eventData);
      form.reset();
      showNotification("success", "Event Added Successfully", "");
      pageRefresh();
      setSelectedFile(null);
      setPreviewUrl("");
      if (onSubmit) onSubmit(res.newEvent);
    } catch (err) {
      setError("Failed to create event. Please try again.");
      console.error("Event creation failed", err);
    } finally {
      setLoading(false);
    }
  };

  const addTag = () => {
    const tag = newTag.trim();
    if (tag && !form.getValues("tags").includes(tag)) {
      form.setValue("tags", [...form.getValues("tags"), tag]);
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    form.setValue(
      "tags",
      form.getValues("tags").filter((tag) => tag !== tagToRemove),
    );
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag();
    }
  };

  const MAX_FILE_SIZE = 1.3 * 1024 * 1024;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      alert("File size must be Less than 1.3 Mb");
      e.target.value = "";
      return;
    }

    if (file) {
      const url: any = await uploadEventImage(file);
      console.log("Uploaded file URL:", url.fileUrl);
      setPreviewUrl(url.fileUrl);
      form.setValue("eventCreativeUrl", url.fileUrl);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="eventTitle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Event Name</FormLabel>
                <FormControl>
                  <Input placeholder="Enter event title" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="eventSubtitle"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Event Subtitle</FormLabel>
                <FormControl>
                  <Input placeholder="Enter event subtitle" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="eventStartDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="eventEndDate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="eventStartTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Time</FormLabel>
                <FormControl>
                  <Input type="time" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="eventEndTime"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Time</FormLabel>
                <FormControl>
                  <Input type="time" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          <FormField
            control={form.control}
            name="eventType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Event Type</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  value={field.value}
                  disabled={isInternalCohort}
                >
                  <FormControl className="w-full">
                    <SelectTrigger>
                      <SelectValue placeholder="Select event type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Workshop">Workshop</SelectItem>
                    <SelectItem value="Hackathon">Hackathon</SelectItem>
                    <SelectItem value="Teardown">Teardown</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          <FormField
            control={form.control}
            name="eventCategory"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl className="w-full">
                    <SelectTrigger>
                      <SelectValue placeholder="Select event type" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="Normal">Normal</SelectItem>
                    <SelectItem value="Community">Community</SelectItem>
                    <SelectItem value="MicroCertificate">
                      Micro Certificate
                    </SelectItem>
                    <SelectItem value="GenAiMicroCertificate">
                      Gen AI Micro Certificate
                    </SelectItem>
                    <SelectItem value="Claude">Claude</SelectItem>
                    <SelectItem value="ClaudeOneDay">Claude One Day</SelectItem>
                    <SelectItem value="InternalCohort">
                      Internal Cohort Session
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="numberOfAttendees"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Number of Attendees</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    placeholder="0"
                    {...field}
                    onChange={(e) =>
                      field.onChange(Number.parseInt(e.target.value) || 0)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="locationType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Location Type</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Enter event location type (e.g., Online, In-person)"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Location ( Event Link )</FormLabel>
                <FormControl>
                  <Textarea placeholder="Enter event location" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="eventCreativeUrl"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Event Banner *</FormLabel>
              <FormControl>
                <div className="space-y-3">
                  {/* Upload Button & File Name */}
                  <div className="flex items-center gap-3">
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="banner-upload"
                    />
                    <Label
                      htmlFor="banner-upload"
                      className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Upload Banner
                    </Label>
                    {selectedFile && (
                      <span className="text-sm text-gray-600 truncate max-w-[200px]">
                        {selectedFile.name}
                      </span>
                    )}
                  </div>

                  {/* Preview and Delete Button */}
                  {previewUrl && (
                    <div className="w-fit h-52 border rounded-lg overflow-hidden relative group">
                      <img
                        src={previewUrl}
                        alt="Event banner preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const filename =
                              field.value?.split("/").pop() || "";
                            await deleteEventFile(filename);
                            field.onChange("");
                            setPreviewUrl("");
                            setSelectedFile(null);
                          } catch (err) {
                            console.error("Delete failed", err);
                          }
                        }}
                        className="absolute top-2 right-2 bg-black/70 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition"
                      >
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Speakers Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label className="text-base font-medium">Speakers</Label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={form.watch("speakers")?.length >= 3}
              onClick={() =>
                appendSpeaker({ name: "", company: "", designation: "" })
              }
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Speaker
            </Button>
          </div>

          {speakerFields.map((field, index) => (
            <div key={field.id} className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Speaker {index + 1}</h4>
                {speakerFields.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSpeaker(index)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <FormField
                  control={form.control}
                  name={`speakers.${index}.name`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Speaker name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`speakers.${index}.company`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Company</FormLabel>
                      <FormControl>
                        <Input placeholder="Company name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name={`speakers.${index}.designation`}
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Designation</FormLabel>
                      <FormControl>
                        <Input placeholder="Job title" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Tags Section */}
        <div className="space-y-3">
          <Label className="text-base font-medium">Tags</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Add a tag"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyPress={handleKeyPress}
            />
            <Button type="button" variant="outline" onClick={addTag}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {form.watch("tags").map((tag, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="flex items-center gap-1"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-1 hover:text-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          {form.formState.errors.tags && (
            <p className="text-sm text-red-600">
              {form.formState.errors.tags.message}
            </p>
          )}
        </div>

        <FormField
          control={form.control}
          name="eventSlug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Event URL</FormLabel>
              <FormControl>
                <div className="relative">
                  <Input placeholder="Enter the URL of the page" {...field} />
                  {slugLoading && (
                    <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-gray-400" />
                  )}
                </div>
              </FormControl>
              {slugAvailable !== null && (
                <p
                  className={`text-sm mt-1 ${
                    slugAvailable ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {slugMessage}
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-3 pt-4">
          <Button type="button" variant="outline">
            Cancel
          </Button>
          <Button type="submit" className="bg-blue-600 hover:bg-blue-700">
            Create Event
          </Button>
        </div>
      </form>
    </Form>
  );
}
