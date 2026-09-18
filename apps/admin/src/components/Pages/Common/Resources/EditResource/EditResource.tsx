"use client";
import type React from "react";
import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Plus,
  X,
  Loader2,
  Save,
  Link,
  Upload,
  Trash2,
  BookOpen,
  ArrowLeft,
  Trash,
} from "lucide-react";
import {
  checkResourceSlugAvailability,
  createResource,
  getResourcesById,
} from "@/services/resources/resourcesService";
import { usePathname } from "next/navigation";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteEventFile,
  uploadEventImage,
} from "@/services/Events/eventServices";
import { useRouter } from "next/navigation";
import { useNotification } from "@/helpers/NotificationContext";
import TiptapEditor from "../../SimpleEditor/SimpleEditor";
import { debounce } from "@/utils/debounce";

const resourceSchema = z.object({
  id: z.number().optional(),
  resourceCategory: z.string().min(1, "Resource category is required"),
  resourceType: z.string().min(1, "Resource type is required"),
  subtitle: z.string().min(1, "Subtitle is required"),
  thumbnail: z.string().min(1, "Thumbnail URL is required"),
  title: z.string().min(1, "Title is required"),
  resourceSlug: z.string().min(2, "Resource URL is required"),
  tagPrimary: z
    .array(z.string())
    .min(1, "At least one primary tag is required"),
  tagSecondary: z.array(z.string()),
  resourceDetails: z
    .object({
      description: z.string().optional(),
      downloadCta: z.string().optional(),
      detailThumbnail: z.string().optional(),
      section1: z
        .object({
          heading: z.string().optional(),
          points: z.array(z.string()),
        })
        .optional(),
      section2: z
        .object({
          heading: z.string().optional(),
          points: z.array(z.string()),
        })
        .optional(),
      resourcePdf: z.string().optional(),
      resourcePdfDescription: z.string().optional(),
    })
    .optional(),
  additionalDetails: z.object({
    whatsappLink: z.string().url().optional(),
  }).optional(),
});

type ResourceFormData = z.infer<typeof resourceSchema>;

interface EditResourceFormProps {
  resourceId?: number;
  onSuccess?: () => void;
}

export const typeOptions = [
  "Ebooks",
  "Guides",
  "Templates",
  "AI Toolkit",
] as const;
export const categoryOptions = [
  "AI",
  "Product Management",
  "Software Development",
] as const;

export default function EditResourcePage({
  resourceId,
  onSuccess,
}: EditResourceFormProps) {
  const [newPrimaryTag, setNewPrimaryTag] = useState("");
  const [newSecondaryTag, setNewSecondaryTag] = useState("");
  const [newSection1Point, setNewSection1Point] = useState("");
  const [newSection2Point, setNewSection2Point] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [detailThumbnailFile, setDetailThumbnailFile] = useState<File | null>(
    null
  );
  const [resourcePdfFile, setResourcePdfFile] = useState<File | null>(null);
  const { showNotification } = useNotification();

  const [slugAvailable, setSlugAvailable] = useState<null | boolean>(null);
  const [slugMessage, setSlugMessage] = useState("");
  const [slugLoading, setSlugLoading] = useState(false);

  const initialSlugValue = useRef<string | null>(null);

  const pathname = usePathname();
  const router = useRouter();
  const id = pathname.split("/").pop();

  const form = useForm<ResourceFormData>({
    resolver: zodResolver(resourceSchema),
    defaultValues: {
      resourceCategory: "",
      resourceType: "",
      subtitle: "",
      thumbnail: "",
      title: "",
      resourceSlug: "",
      tagPrimary: [],
      tagSecondary: [],
      resourceDetails: {
        description: "Anything",
        downloadCta: "",
        detailThumbnail: "",
        section1: { heading: "", points: [] },
        section2: { heading: "", points: [] },
        resourcePdf: "",
        resourcePdfDescription: "",
      },
      additionalDetails: {
        whatsappLink: "",
      },
    },
  });

  useEffect(() => {
    const loadResource = async () => {
      setLoading(true);
      try {
        const response = await getResourcesById(id as string);
        console.log("response ", response);

        if (response) {
          form.reset({
            id: response.id,
            resourceCategory: response.resourceCategory || "",
            resourceType: response.resourceType || "",
            subtitle: response.subtitle || "",
            thumbnail: response.thumbnail || "",
            title: response.title || "",
            resourceSlug: response.resourceSlug,
            tagPrimary: response.tagPrimary || [],
            tagSecondary: response.tagSecondary || [],
            resourceDetails: {
              description: response.resourceDetails?.description || "",
              downloadCta: response.resourceDetails?.downloadCta || "",
              detailThumbnail: response.resourceDetails?.detailThumbnail || "",
              section1: {
                heading: response.resourceDetails?.section1?.heading || "",
                points: response.resourceDetails?.section1?.points || [],
              },
              section2: {
                heading: response.resourceDetails?.section2?.heading || "",
                points: response.resourceDetails?.section2?.points || [],
              },
              resourcePdf: response.resourceDetails?.resourcePdf || "",
              resourcePdfDescription:
                response.resourceDetails?.resourcePdfDescription || "",
            },
            additionalDetails: {
              whatsappLink: response.additionalDetails?.whatsappLink || "",
            }
          });
        }

        if (initialSlugValue.current === null) {
          initialSlugValue.current = response.resourceSlug
        }
      } catch (error) {
        console.error("Error loading resource:", error);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      loadResource();
    }
  }, [resourceId, form, id]);

  const debouncedCheckSlug = debounce(async (value: string, id?: string) => {
    setSlugLoading(true);

    try {
      const res = await checkResourceSlugAvailability(value, id);
      setSlugAvailable(res.available);
      setSlugMessage(res.message);
    } catch {
      setSlugAvailable(null);
      setSlugMessage("Error checking slug");
    }

    setSlugLoading(false);
  }, 400);

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;

    // Update form field
    form.setValue("resourceSlug", value);

    if (value.trim() === initialSlugValue.current) {
      setSlugMessage("");
      return;
    }

    // Reset UI if empty
    if (!value) {
      setSlugAvailable(null);
      setSlugMessage("");
      return;
    }

    // Debounced API call
    debouncedCheckSlug(value.trim(), id);
  };

  const handleSubmit = async (data: ResourceFormData) => {
    setSubmitting(true);
    try {
      await createResource(data);
      showNotification("success", "Resource Updated Successfully", "");
    } catch (error) {
      console.error("Error saving resource:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const addPrimaryTag = () => {
    if (
      newPrimaryTag.trim() &&
      !form.getValues("tagPrimary").includes(newPrimaryTag.trim())
    ) {
      const currentTags = form.getValues("tagPrimary");
      form.setValue("tagPrimary", [...currentTags, newPrimaryTag.trim()]);
      setNewPrimaryTag("");
    }
  };

  const removePrimaryTag = (tagToRemove: string) => {
    const currentTags = form.getValues("tagPrimary");
    form.setValue(
      "tagPrimary",
      currentTags.filter((tag) => tag !== tagToRemove)
    );
  };

  const addSecondaryTag = () => {
    if (
      newSecondaryTag.trim() &&
      !form.getValues("tagSecondary").includes(newSecondaryTag.trim())
    ) {
      const currentTags = form.getValues("tagSecondary");
      form.setValue("tagSecondary", [...currentTags, newSecondaryTag.trim()]);
      setNewSecondaryTag("");
    }
  };

  const removeSecondaryTag = (tagToRemove: string) => {
    const currentTags = form.getValues("tagSecondary");
    form.setValue(
      "tagSecondary",
      currentTags.filter((tag) => tag !== tagToRemove)
    );
  };

  // Thumbnail upload
  const handleThumbnailUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url: any = await uploadEventImage(file);
    showNotification("success", "Thumbnail Added Successfully", "");
    console.log("Uploaded thumbnail URL:", url.fileUrl);

    setThumbnailFile(url.fileUrl);
    form.setValue("thumbnail", url.fileUrl);
  };

  // Detail thumbnail upload
  const handleDetailThumbnailUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url: any = await uploadEventImage(file);
    showNotification("success", "Detail Thumbnail Added Successfully", "");
    console.log("Uploaded detail thumbnail URL:", url.fileUrl);

    setDetailThumbnailFile(url.fileUrl);
    form.setValue("resourceDetails.detailThumbnail", url.fileUrl);
  };

  // Resource PDF Upload
  const handleResourcePDFUpload = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const url: any = await uploadEventImage(file);
    showNotification("success", "PDF Added Successfully", "");
    console.log("Uploaded detail thumbnail URL:", url.fileUrl);

    setResourcePdfFile(url.fileUrl);
    form.setValue("resourceDetails.resourcePdf", url.fileUrl);
  };

  const addSection1Point = () => {
    if (newSection1Point.trim()) {
      const currentPoints =
        form.getValues("resourceDetails.section1.points") || [];
      form.setValue("resourceDetails.section1.points", [
        ...currentPoints,
        newSection1Point.trim(),
      ]);
      setNewSection1Point("");
    }
  };

  const removeSection1Point = (index: number) => {
    const currentPoints =
      form.getValues("resourceDetails.section1.points") || [];
    form.setValue(
      "resourceDetails.section1.points",
      currentPoints.filter((_: any, i: any) => i !== index)
    );
  };

  const addSection2Point = () => {
    if (newSection2Point.trim()) {
      const currentPoints =
        form.getValues("resourceDetails.section2.points") || [];
      form.setValue("resourceDetails.section2.points", [
        ...currentPoints,
        newSection2Point.trim(),
      ]);
      setNewSection2Point("");
    }
  };

  const removeSection2Point = (index: number) => {
    const currentPoints =
      form.getValues("resourceDetails.section2.points") || [];
    form.setValue(
      "resourceDetails.section2.points",
      currentPoints.filter((_: any, i: any) => i !== index)
    );
  };

  const handleKeyPress = (
    e: React.KeyboardEvent,
    type: "primary" | "secondary" | "section1" | "section2"
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (type === "primary") {
        addPrimaryTag();
      } else if (type === "secondary") {
        addSecondaryTag();
      } else if (type === "section1") {
        addSection1Point();
      } else if (type === "section2") {
        addSection2Point();
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="flex items-center gap-2">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Loading resource data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mx-auto p-6 space-y-8 overflow-y-auto h-screen">
      <div className="flex items-center gap-5">
        <ArrowLeft
          className="h-5 w-5 m-2 cursor-pointer"
          onClick={() => router.back()}
        />
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Resource Details
        </h1>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-8">
          {/* Basic Resource Information */}
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Title</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter resource title" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="subtitle"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Subtitle</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter resource subtitle"
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
                  name="resourceType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Resource Type</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl className="w-full">
                          <SelectTrigger>
                            <SelectValue placeholder="Select resource type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {typeOptions.map((type) => (
                            <SelectItem key={type} value={type}>
                              {type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="resourceCategory"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Resource Category</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl className="w-full">
                          <SelectTrigger>
                            <SelectValue placeholder="Select resource category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categoryOptions.map((category) => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="resourceSlug"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Resource URL</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            onChange={handleSlugChange}
                            placeholder="Enter the URL of the page"
                          />
                          {slugLoading && (
                            <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-gray-400" />
                          )}
                        </div>
                      </FormControl>
                      {slugAvailable !== null && (
                        <p
                          className={`text-sm mt-1 ${slugAvailable
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
                name="thumbnail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Thumbnail</FormLabel>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            document.getElementById("thumbnail-upload")?.click()
                          }
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Image
                        </Button>
                        <input
                          id="thumbnail-upload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleThumbnailUpload}
                        />
                      </div>
                    </div>
                    <FormMessage />
                    {field.value && (
                      <div className="w-fit h-[200px] border rounded-lg overflow-hidden bg-gray-50 mt-2">
                        <img
                          src={field.value || "/placeholder.svg"}
                          alt="Thumbnail preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Additional Info (Meta) */}
          <Card>
            <CardHeader>
              <CardTitle>Additional Info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">

              <FormField
                control={form.control}
                name="additionalDetails.whatsappLink"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp Channel Link</FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="https://whatsapp.com/channel/your-group"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>


          {/* Primary Tags */}
          <Card>
            <CardHeader>
              <CardTitle>Primary Tags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Add a primary tag"
                  value={newPrimaryTag}
                  onChange={(e) => setNewPrimaryTag(e.target.value)}
                  onKeyPress={(e) => handleKeyPress(e, "primary")}
                />
                <Button type="button" variant="outline" onClick={addPrimaryTag}>
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {form.watch("tagPrimary").map((tag, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-1 border-2 rounded-md p-2 bg-[#E7E5E3]"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removePrimaryTag(tag)}
                      className="ml-1 hover:text-red-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              {form.formState.errors.tagPrimary && (
                <p className="text-sm text-red-600">
                  {form.formState.errors.tagPrimary.message}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Secondary Tags */}
          <Card>
            <CardHeader>
              <CardTitle>Secondary Tags</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder="Add a secondary tag"
                  value={newSecondaryTag}
                  onChange={(e) => setNewSecondaryTag(e.target.value)}
                  onKeyPress={(e) => handleKeyPress(e, "secondary")}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={addSecondaryTag}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {form.watch("tagSecondary").map((tag, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-1 border-2  rounded-md p-2 bg-[#E7E5E3]"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeSecondaryTag(tag)}
                      className="ml-1 hover:text-red-600 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Description */}
          <Card>
            <CardHeader>
              <CardTitle>Description for Detail Page</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <FormField
                control={form.control}
                name="resourceDetails.description"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <TiptapEditor
                        placeholder="Please write a detailed description"
                        content={field.value ?? ""}
                        onChange={field.onChange}
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Resource Details  */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Link className="w-5 h-5" />
                Resource Details
              </CardTitle>
            </CardHeader>

            <CardContent>
              <FormField
                control={form.control}
                name="resourceDetails.downloadCta"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CTA Text</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Download PDF, Get Resource"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Detail Thumbnail
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FormField
                control={form.control}
                name="resourceDetails.detailThumbnail"
                render={({ field }) => (
                  <FormItem>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            document
                              .getElementById("detail-thumbnail-upload")
                              ?.click()
                          }
                        >
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Image
                        </Button>
                        <input
                          id="detail-thumbnail-upload"
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleDetailThumbnailUpload}
                        />
                      </div>
                    </div>
                    <FormMessage />
                    {field.value && (
                      <div className="w-32 h-[200px] border rounded-lg overflow-hidden bg-gray-50 mt-2">
                        <img
                          src={field.value || "/placeholder.svg"}
                          alt="Detail thumbnail preview"
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Section 1 - Learning Points */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                What You'll Learn (Points)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="resourceDetails.section1.heading"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section Name</FormLabel>
                    <FormControl>
                      <Input placeholder="What You'll Learn" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <FormLabel className="text-sm font-medium">
                  Add Sub-Points
                </FormLabel>
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="Add a point"
                    value={newSection1Point}
                    onChange={(e) => setNewSection1Point(e.target.value)}
                    onKeyPress={(e) => handleKeyPress(e, "section1")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addSection1Point}
                  >
                    <Plus className="w-4 h-4" />
                    Add Point
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <FormLabel className="text-sm font-medium">Points</FormLabel>
                {form
                  .watch("resourceDetails.section1.points")
                  ?.map((point: any, index: any) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-3 border rounded-lg bg-gray-50"
                    >
                      <span className="flex-1">{point}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSection1Point(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>

          {/* Section 2 - Additional Points */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                Additional Information (Points)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="resourceDetails.section2.heading"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Additional Information" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div>
                <FormLabel className="text-sm font-medium">
                  Add Sub-Points
                </FormLabel>
                <div className="flex gap-2 mt-2">
                  <Input
                    placeholder="Add a point"
                    value={newSection2Point}
                    onChange={(e) => setNewSection2Point(e.target.value)}
                    onKeyPress={(e) => handleKeyPress(e, "section2")}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={addSection2Point}
                  >
                    <Plus className="w-4 h-4" />
                    Add Point
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <FormLabel className="text-sm font-medium">Points</FormLabel>
                {form
                  .watch("resourceDetails.section2.points")
                  ?.map((point: any, index: any) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 p-3 border rounded-lg bg-gray-50"
                    >
                      <span className="flex-1">{point}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeSection2Point(index)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Resource PDF
              </CardTitle>
            </CardHeader>

            <CardContent>
              <div className=" space-y-4">
                <FormField
                  control={form.control}
                  name="resourceDetails.resourcePdf"
                  render={({ field }) => (
                    <FormItem>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              document
                                .getElementById("detail-pdf-upload")
                                ?.click()
                            }
                          >
                            <Upload className="w-4 h-4 mr-2" />
                            Upload PDF
                          </Button>
                          <input
                            id="detail-pdf-upload"
                            type="file"
                            accept="application/pdf"
                            className="hidden"
                            onChange={handleResourcePDFUpload}
                          />
                        </div>
                      </div>
                      <FormMessage />
                      {field.value && (
                        <div className="mt-4 w-full max-w-lg">
                          <div className="border rounded-xl shadow-sm bg-white">
                            {/* Header */}
                            <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
                              <h3 className="text-sm font-medium text-gray-700">
                                PDF Preview
                              </h3>
                              <div className="flex items-center gap-2">
                                <a
                                  href={field.value}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                                >
                                  Open
                                </a>

                                <Button
                                  type="button"
                                  size="icon"
                                  variant="ghost"
                                  onClick={async () => {
                                    try {
                                      await deleteEventFile(
                                        field.value?.split("/").pop() || ""
                                      );
                                      field.onChange("");
                                    } catch (err) {
                                      console.error("Delete failed", err);
                                    }
                                  }}
                                >
                                  <Trash className="w-4 h-4 text-red-500" />
                                </Button>
                              </div>
                            </div>

                            {/* PDF Preview */}
                            <div className="h-[500px] flex items-center justify-center bg-gray-100">
                              <object
                                data={field.value}
                                type="application/pdf"
                                width="100%"
                                height="100%"
                              >
                                <div className="p-4 text-center text-sm text-gray-500">
                                  PDF preview not available.{" "}
                                  <a
                                    href={field.value}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-500 underline"
                                  >
                                    Open PDF
                                  </a>
                                </div>
                              </object>
                            </div>
                          </div>
                        </div>
                      )}
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>


          <Card>
            <CardHeader>
              <CardTitle>Resource Description For the PDF</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <FormField
                control={form.control}
                name="resourceDetails.resourcePdfDescription"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <TiptapEditor
                        placeholder="Please write a detailed description"
                        content={field.value ?? ""}
                        onChange={field.onChange}
                        className="w-full"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>
          {/* Submit Button */}
          <div className="flex justify-end gap-3">
            <Button
              type="submit"
              disabled={submitting}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
