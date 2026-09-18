"use client";
import type React from "react";
import { useNotification } from "@/helpers/NotificationContext";
import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Plus,
  X,
  Calendar,
  User,
  Loader2,
  ArrowLeft,
  Upload,
  ImageIcon,
} from "lucide-react";
import { TeardownEventForm } from "./Components/TeardownEventForm";
import { WorkshopEventForm } from "./Components/WorkshopEventForm";
import { usePathname, useRouter } from "next/navigation";
import {
  checkSlugAvailability,
  deleteEventFile,
  getEventById,
  updateEvents,
  uploadEventImage,
} from "@/services/Events/eventServices";
import Cookies from "js-cookie";

const speakerSchema = z.object({
  name: z.string().min(1, "Speaker name is required"),
  company: z.string().min(1, "Company is required"),
  designation: z.string().min(1, "Designation is required"),
  photoUrl: z.string().optional(),
});

const baseEventSchema = z.object({
  eventTitle: z.string().min(1, "Event title is required"),
  eventSubtitle: z.string().min(1, "Event subtitle is required"),
  eventStartDate: z.string().min(1, "Start date is required"),
  eventEndDate: z.string().min(1, "End date is required"),
  eventStartTime: z.string().min(1, "Start time is required"),
  eventEndTime: z.string().min(1, "End time is required"),
  eventType: z.enum(["Teardown", "Hackathon", "Workshop"]),
  speakers: z.array(speakerSchema).min(1, "At least one speaker is required"),
  numberOfAttendees: z.number().min(0, "Number of attendees must be positive"),
  eventCreativeUrl: z.string().min(1, "Event banner is required"),
  tags: z.array(z.string()).min(1, "At least one tag is required"),
  locationType: z.string().min(1, "Location Type is required"),
  location: z.string().optional(),
  eventSlug: z.string().min(2, "Event URL is required"),
  eventCategory: z.enum(["Community", "Normal", "MicroCertificate" , "GenAiMicroCertificate", "Claude", "ClaudeOneDay", "InternalCohort"]),
});

type BaseEventFormData = z.infer<typeof baseEventSchema>;

interface EditEventPageProps {
  eventId?: string;
}

export default function EditEventPage({ eventId }: EditEventPageProps) {
  const [newTag, setNewTag] = useState("");
  const [selectedBannerFile, setSelectedBannerFile] = useState<File | null>(
    null,
  );
  const [bannerPreviewUrl, setBannerPreviewUrl] = useState<string>("");
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const [eventDetails, setEventDetails] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const id = eventId || pathname.split("/").pop();

  const [slugAvailable, setSlugAvailable] = useState<null | boolean>(null);
  const [slugMessage, setSlugMessage] = useState("");
  const [slugLoading, setSlugLoading] = useState(false);

  const role = Cookies.get("currentRole");

  const form = useForm<BaseEventFormData>({
    resolver: zodResolver(baseEventSchema),
    defaultValues: {
      eventTitle: "",
      eventSubtitle: "",
      eventStartDate: "",
      eventEndDate: "",
      eventStartTime: "",
      eventEndTime: "",
      eventType: "Workshop",
      speakers: [{ name: "", company: "", designation: "", photoUrl: "" }],
      numberOfAttendees: 0,
      eventCreativeUrl: "",
      tags: [],
      location: "",
      locationType: "",
      eventSlug: "",
      eventCategory: "Normal",
    },
  });

  const watchedEventType = form.watch("eventType");
  const watchedEventCategory = form.watch("eventCategory");
  const isInternalCohort = watchedEventCategory === "InternalCohort";
  const { showNotification } = useNotification();

  // Internal Cohort Sessions are always of type "Workshop"
  useEffect(() => {
    if (isInternalCohort && form.getValues("eventType") !== "Workshop") {
      form.setValue("eventType", "Workshop");
    }
  }, [isInternalCohort]);

  // Add a ref to track if this is the initial load
  const isInitialMount = useRef(true);
  const initialSlugValue = useRef<string | null>(null);

  // Fetch event data on component mount
  useEffect(() => {
    const getEventDetail = async () => {
      if (!id) return;
      try {
        setLoading(true);
        const response = await getEventById(id as string);
        const eventData =
          response.result === "SUCCESS"
            ? response.event
            : response.data || response;

        // Store the initial slug value
        initialSlugValue.current = eventData.eventSlug || "";

        // Populate form with fetched data
        form.reset({
          eventTitle: eventData.eventTitle || "",
          eventSubtitle: eventData.eventSubtitle || "",
          eventStartDate: eventData.eventStartDate || "",
          eventEndDate: eventData.eventEndDate || "",
          eventStartTime: eventData.eventStartTime || "",
          eventEndTime: eventData.eventEndTime || "",
          eventType: eventData.eventType || "Workshop",
          speakers:
            eventData.speakers && eventData.speakers.length > 0
              ? eventData.speakers
              : [{ name: "", company: "", designation: "", photoUrl: "" }],
          numberOfAttendees: eventData.numberOfAttendees || 0,
          eventCreativeUrl: eventData.eventCreativeUrl || "",
          tags: eventData.tags || [],
          location: eventData.location || "",
          locationType: eventData.locationType || "",
          eventSlug: eventData.eventSlug || "",
          eventCategory: eventData.eventCategory || "Normal",
        });

        setEventDetails(eventData.eventDetails || {});

        // Set preview URLs
        if (eventData.eventCreativeUrl) {
          setBannerPreviewUrl(eventData.eventCreativeUrl);
        }
      } catch (error) {
        console.error("Error fetching event:", error);
      } finally {
        setLoading(false);
        // Mark that initial mount is complete after data is loaded
        isInitialMount.current = false;
      }
    };

    getEventDetail();
  }, [id, form]);

  const watchSlug = form.watch("eventSlug");

  useEffect(() => {
    // Skip if it's the initial mount or if slug matches the initial value
    if (isInitialMount.current || watchSlug === initialSlugValue.current) {
      return;
    }

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

  const handleSubmit = async (data: BaseEventFormData) => {
    if (!id) return;
    try {
      setUpdating(true);
      const completeEventData = {
        ...data,
        isPublished: false,
        eventDetails:
          Object.keys(eventDetails).length > 0 ? eventDetails : null,
        ctaType:
          data.eventType === "Workshop" ? "Join Waitlist" : "Register Now",
      };

      const response = await updateEvents(id as string, completeEventData);
      if (response.result === "SUCCESS" || response.success !== false) {
        showNotification("success", "Updated Successfully", "");
      } else {
        throw new Error(response.message || "Update failed");
      }
    } catch (error: any) {
      console.error("Error updating event:", error);
      showNotification("error", "Failed to Update the Data", "");
    } finally {
      setUpdating(false);
    }
  };

  const addTag = () => {
    if (newTag.trim() && !form.getValues("tags").includes(newTag.trim())) {
      const currentTags = form.getValues("tags");
      form.setValue("tags", [...currentTags, newTag.trim()]);
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    const currentTags = form.getValues("tags");
    form.setValue(
      "tags",
      currentTags.filter((tag) => tag !== tagToRemove),
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
      form.setError("eventCreativeUrl", {
        type: "manual",
        message: "File size must be 1.3 MB or less",
      });
      e.target.value = "";
      return;
    }
    if (file) {
      setUploadingBanner(true);
      try {
        const url: any = await uploadEventImage(file);
        console.log("Uploaded file URL:", url.fileUrl);
        setBannerPreviewUrl(url.fileUrl);
        setSelectedBannerFile(file);
        form.setValue("eventCreativeUrl", url.fileUrl);
      } catch (error) {
        console.error("Error uploading banner:", error);
      } finally {
        setUploadingBanner(false);
      }
    }
  };

  const addSpeaker = () => {
    const currentSpeakers = form.getValues("speakers");
    form.setValue("speakers", [
      ...currentSpeakers,
      { name: "", company: "", designation: "", photoUrl: "" },
    ]);
  };

  const removeSpeaker = (index: number) => {
    const currentSpeakers = form.getValues("speakers");
    if (currentSpeakers.length > 1) {
      form.setValue(
        "speakers",
        currentSpeakers.filter((_, i) => i !== index),
      );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading event data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Fixed Header */}
      <div className="p-8 border-b bg-white">
        <div className="flex items-center gap-5">
          <ArrowLeft
            className="h-5 w-5 m-2 cursor-pointer"
            onClick={() => router.push(`/${role}/events`)}
          />
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Edit Event</h1>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="mx-auto p-8 pb-24">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(handleSubmit)}
              className="space-y-8"
            >
              {/* Basic Event Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Basic Event Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="eventTitle"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Event Title</FormLabel>
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
                            <Input
                              placeholder="Enter event subtitle"
                              {...field}
                            />
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                            <FormControl>
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select event type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Workshop">Workshop</SelectItem>
                              <SelectItem value="Hackathon">
                                Hackathon
                              </SelectItem>
                              <SelectItem value="Teardown">Teardown</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

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
                              <SelectItem value="Community">
                                Community
                              </SelectItem>
                              <SelectItem value="MicroCertificate">Micro Certificate</SelectItem>
                              <SelectItem value="GenAiMicroCertificate">Gen AI Micro Certificate</SelectItem>
                              <SelectItem value="Claude">Claude</SelectItem>
                              <SelectItem value="ClaudeOneDay">Claude One Day</SelectItem>
                              <SelectItem value="InternalCohort">Internal Cohort Session</SelectItem>
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
                                field.onChange(
                                  Number.parseInt(e.target.value) || 0,
                                )
                              }
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="locationType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Location Type</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="e.g., Online, In-person"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="eventSlug"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Event URL</FormLabel>
                          <FormControl>
                            <div className="relative">
                              <Input
                                placeholder="Enter the URL of the page"
                                {...field}
                              />
                              {slugLoading && (
                                <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-gray-400" />
                              )}
                            </div>
                          </FormControl>
                          {slugAvailable !== null && (
                            <p
                              className={`text-sm mt-1 ${
                                slugAvailable
                                  ? "text-green-600"
                                  : "text-red-600"
                              }`}
                            >
                              {slugMessage}
                            </p>
                          )}
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Location ( Event Link )</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Enter event location"
                            className="min-h-[100px]"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Event Banner */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ImageIcon className="w-5 h-5" />
                    Event Banner
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <FormField
                    control={form.control}
                    name="eventCreativeUrl"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Event Banner *</FormLabel>
                        <FormControl>
                          <div className="space-y-4">
                            <div className="flex items-center gap-3">
                              <Input
                                type="file"
                                accept="image/*"
                                onChange={handleFileUpload}
                                className="hidden"
                                id="banner-upload"
                                disabled={uploadingBanner}
                              />
                              <Label
                                htmlFor="banner-upload"
                                className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
                              >
                                {uploadingBanner ? (
                                  <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Uploading...
                                  </>
                                ) : (
                                  <>
                                    <Upload className="w-4 h-4 mr-2" />
                                    Upload Banner
                                  </>
                                )}
                              </Label>
                              {selectedBannerFile && (
                                <span className="text-sm text-gray-600">
                                  {selectedBannerFile.name}
                                </span>
                              )}
                            </div>
                            {bannerPreviewUrl && (
                              <div className="w-fit h-52 border rounded-lg overflow-hidden relative group">
                                <img
                                  src={bannerPreviewUrl || "/placeholder.svg"}
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
                                      setBannerPreviewUrl("");
                                      setSelectedBannerFile(null);
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
                            {/* Hidden input to maintain form connection */}
                            <input
                              type="hidden"
                              {...field}
                              value={field.value || ""}
                            />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </CardContent>
              </Card>

              {/* Speakers Section */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Speakers
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-medium">
                      Event Speakers
                    </Label>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={addSpeaker}
                      disabled={form.watch("speakers")?.length === 7}
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Add Speaker
                    </Button>
                  </div>
                  {form.watch("speakers").map((speaker, index) => (
                    <div
                      key={index}
                      className="p-4 border rounded-lg space-y-4"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">Speaker {index + 1}</h4>
                        {form.watch("speakers").length > 1 && (
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

                      {/* Speaker Photo URL Input */}
                      <FormField
                        control={form.control}
                        name={`speakers.${index}.photoUrl`}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Speaker Photo URL</FormLabel>
                            <FormControl>
                              <Input
                                placeholder="Enter image URL (e.g., https://example.com/photo.jpg)"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                            {field.value && (
                              <div className="w-20 h-20 border rounded-lg overflow-hidden bg-gray-50 mt-2">
                                <img
                                  src={
                                    field.value ||
                                    "/placeholder.svg?height=80&width=80"
                                  }
                                  alt={`Speaker ${index + 1} photo`}
                                  className="w-full h-full object-cover"
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement;
                                    target.src =
                                      "/placeholder.svg?height=80&width=80";
                                  }}
                                />
                              </div>
                            )}
                          </FormItem>
                        )}
                      />

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
                </CardContent>
              </Card>

              {/* Tags Section */}
              <Card>
                <CardHeader>
                  <CardTitle>Event Tags</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
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
                </CardContent>
              </Card>

              {/* Event Type Specific Forms */}
              {(watchedEventType === "Teardown" ||
                watchedEventType === "Hackathon") && (
                <TeardownEventForm
                  eventDetails={eventDetails}
                  setEventDetails={setEventDetails}
                  eventType={watchedEventType}
                />
              )}
              {watchedEventType === "Workshop" && (
                <WorkshopEventForm
                  eventDetails={eventDetails}
                  setEventDetails={setEventDetails}
                />
              )}
            </form>
          </Form>
        </div>

        {/* Fixed Footer */}
        <div className="bg-white border-t p-4 shadow-md pb-10">
          <div className="max-w-6xl mx-auto flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.push(`/${role}/events`)}
            >
              Cancel
            </Button>
            <Button
              onClick={form.handleSubmit(handleSubmit)}
              className="bg-blue-600 hover:bg-blue-700"
              disabled={updating || uploadingBanner}
            >
              {updating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                "Update Event"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
