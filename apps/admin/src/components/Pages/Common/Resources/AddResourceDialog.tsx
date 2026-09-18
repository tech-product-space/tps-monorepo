"use client";

import type React from "react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Loader2, Plus, X } from "lucide-react";
import { IResource } from "./Resources";
import { checkResourceSlugAvailability, createResource } from "@/services/resources/resourcesService";
import { uploadEventImage } from "@/services/Events/eventServices";
import { useNotification } from "@/helpers/NotificationContext";
import { debounce } from "@/utils/debounce";

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

export type ResourceType = (typeof typeOptions)[number];
export type ResourceCategory = (typeof categoryOptions)[number];

export const resourceSchema = z.object({
  title: z.string().min(1, "Title is required"),
  subtitle: z.string().min(1, "Subtitle is required"),
  resourceType: z.enum(typeOptions),
  resourceCategory: z.enum(categoryOptions),
  tagPrimary: z.array(z.string()),
  tagSecondary: z.array(z.string()),
  thumbnail: z.string().url("Invalid URL"),
  resourceSlug: z.string().min(2, "Resource URL is required"),
});

export type ResourceFormData = z.infer<typeof resourceSchema>;

interface AddResourceDialogProps {
  onSubmit: (resource: Omit<IResource, "id">) => void;
  pageRefresh: () => void;
}

export function AddResourceDialog({
  onSubmit,
  pageRefresh,
}: AddResourceDialogProps) {
  const [newTagPrimary, setNewTagPrimary] = useState("");
  const [newTagSecondary, setNewTagSecondary] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { showNotification } = useNotification();
  const form = useForm<ResourceFormData>({
    resolver: zodResolver(resourceSchema),
    defaultValues: {
      title: "",
      subtitle: "",
      resourceType: "Ebooks",
      resourceCategory: "AI",
      tagPrimary: [],
      tagSecondary: [],
      thumbnail: "",
      resourceSlug: "",
    },
  });

  const [slugAvailable, setSlugAvailable] = useState<null | boolean>(null);
  const [slugMessage, setSlugMessage] = useState("");
  const [slugLoading, setSlugLoading] = useState(false);


  const debouncedCheckSlug = debounce(async (value: string) => {
    setSlugLoading(true);

    try {
      const res = await checkResourceSlugAvailability(value);
      setSlugAvailable(res.available);
      setSlugMessage(res.message);
    } catch {
      setSlugAvailable(null);
      setSlugMessage("Error checking slug availability");
    }

    setSlugLoading(false);
  }, 400);

  const handleSlugChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();

    // update RHF form value
    form.setValue("resourceSlug", value);

    // if empty → reset UI
    if (!value) {
      setSlugAvailable(null);
      setSlugMessage("");
      return;
    }

    // Debounced API call
    debouncedCheckSlug(value);
  };


  const handleSubmit = async (data: ResourceFormData) => {
    console.log("Data submites : ", data);
    setLoading(true);
    setError(null);

    try {
      const response = await createResource(data);
      showNotification("success", "Resource Added Successfully", "");
      form.reset();
      pageRefresh();
      setSelectedFile(null);
      setPreviewUrl("");
      if (onSubmit) onSubmit(data);
    } catch (err) {
      setError("Failed to create resource. Please try again.");
      console.error("Resource creation failed", err);
    } finally {
      setLoading(false);
    }
  };

  const addTag1 = () => {
    const tag = newTagPrimary.trim();
    if (tag && !form.getValues("tagPrimary").includes(tag)) {
      form.setValue("tagPrimary", [...form.getValues("tagPrimary"), tag]);
      setNewTagPrimary("");
    }
  };

  const addTag2 = () => {
    const tag = newTagSecondary.trim();
    if (tag && !form.getValues("tagSecondary").includes(tag)) {
      form.setValue("tagSecondary", [...form.getValues("tagSecondary"), tag]);
      setNewTagSecondary("");
    }
  };

  const removeTag1 = (tagToRemove: string) => {
    form.setValue(
      "tagPrimary",
      form.getValues("tagPrimary").filter((tag) => tag !== tagToRemove)
    );
  };

  const removeTag2 = (tagToRemove: string) => {
    form.setValue(
      "tagSecondary",
      form.getValues("tagSecondary").filter((tag) => tag !== tagToRemove)
    );
  };

  const handleKeyPress1 = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag1();
    }
  };

  const handleKeyPress2 = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addTag2();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url: any = await uploadEventImage(file);
      showNotification("success", "Thumbnail Added Successfully", "");
      console.log("Uploaded file URL:", url.fileUrl);
      setPreviewUrl(url.fileUrl);
      form.setValue("thumbnail", url.fileUrl);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
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
                  <Input placeholder="Enter resource subtitle" {...field} />
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
                    placeholder="Enter the URL of the page"
                    onChange={handleSlugChange}
                  />
                  {slugLoading && (
                    <Loader2 className="absolute right-2 top-2 h-4 w-4 animate-spin text-gray-400" />
                  )}
                </div>
              </FormControl>
              {slugAvailable !== null && (
                <p
                  className={`text-sm text-left mt-1 ${slugAvailable ? "text-green-600" : "text-red-600"
                    }`}
                >
                  {slugMessage}
                </p>
              )}
              <FormMessage className="text-left" />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="thumbnail"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Thumbnail *</FormLabel>
              <FormControl>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="thumbnail-upload"
                    />
                    <Label
                      htmlFor="thumbnail-upload"
                      className="cursor-pointer inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Upload Thumbnail
                    </Label>
                    {selectedFile && (
                      <span className="text-sm text-gray-600 truncate max-w-[200px]">
                        {selectedFile.name}
                      </span>
                    )}
                  </div>

                  {previewUrl && (
                    <div className="w-fit h-52 border rounded-lg overflow-hidden relative group">
                      <img
                        src={previewUrl || "/placeholder.svg"}
                        alt="Thumbnail preview"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          field.onChange("");
                          setPreviewUrl("");
                          setSelectedFile(null);
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

        <div className="space-y-3">
          <Label className="text-base font-medium">Tags 1</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Add a tag"
              value={newTagPrimary}
              onChange={(e) => setNewTagPrimary(e.target.value)}
              onKeyPress={handleKeyPress1}
            />
            <Button type="button" variant="outline" onClick={addTag1}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {form.watch("tagPrimary").map((tag, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="flex items-center gap-1"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag1(tag)}
                  className="ml-1 hover:text-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          {form.formState.errors.tagPrimary && (
            <p className="text-sm text-red-600">
              {form.formState.errors.tagPrimary.message}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <Label className="text-base font-medium">Tags 2</Label>
          <div className="flex gap-2">
            <Input
              placeholder="Add a tag"
              value={newTagSecondary}
              onChange={(e) => setNewTagSecondary(e.target.value)}
              onKeyPress={handleKeyPress2}
            />
            <Button type="button" variant="outline" onClick={addTag2}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {form.watch("tagSecondary").map((tag, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="flex items-center gap-1"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => removeTag2(tag)}
                  className="ml-1 hover:text-red-600"
                >
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            ))}
          </div>
          {form.formState.errors.tagSecondary && (
            <p className="text-sm text-red-600">
              {form.formState.errors.tagSecondary.message}
            </p>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
            {error}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-4">
          <Button
            type="submit"
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading ? "Creating..." : "Create Resource"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
