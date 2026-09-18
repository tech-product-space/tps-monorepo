"use client";

import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/gradient/components/ui/card";
import { Input } from "@/gradient/components/ui/input";
import { Button } from "@/gradient/components/ui/button";
import { Label } from "@/gradient/components/ui/label";
import { Textarea } from "@/gradient/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
import { Loader2, Check, X } from "lucide-react";
import { useResourceStore } from "@/gradient/lib/store/useResourceStore";
import { resourceService } from "@/gradient/services/resourceService";
import { toast } from "sonner";
import { useSlugAvailability } from "@/gradient/hooks/useSlugAvailability";
import {
  RESOURCE_CATEGORIES,
  ResourceCategory,
  ResourceType,
  RESOURCE_TYPES,
} from "@/gradient/components/constants/resourceCategories";

interface AddResourceProps {
  onSuccess: () => void;
}

export default function AddResource({ onSuccess }: AddResourceProps) {
  const { setShowCreateForm } = useResourceStore();

  const [formData, setFormData] = useState({
    title: "",
    subtitle: "",
    resourceType: "" as ResourceType | "",
    resourceCategory: "" as ResourceCategory | "",
    resourceSlug: "",
  });

  const [loading, setLoading] = useState(false);
  const { slugAvailable, checkingSlug } = useSlugAvailability(formData.resourceSlug, resourceService.checkSlugAvailability);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleTypeChange = (value: ResourceType) => {
    setFormData((prev) => ({ ...prev, resourceType: value }));
  };

  const handleCategoryChange = (value: ResourceCategory) => {
    setFormData((prev) => ({ ...prev, resourceCategory: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const toastId = toast.loading("Creating resource...");

    try {
      const payload = {
        title: formData.title,
        subtitle: formData.subtitle,
        resourceType: formData.resourceType,
        resourceCategory: formData.resourceCategory,
        resourceSlug: formData.resourceSlug,
      };

      const response = await resourceService.createResource(payload);

      if (response.success) {
        toast.success("Resource created successfully!", { id: toastId });

        setFormData({
          title: "",
          subtitle: "",
          resourceType: "",
          resourceCategory: "",
          resourceSlug: "",
        });

        setShowCreateForm(false);
        onSuccess();
      } else {
        toast.error(response.message || "Failed to create resource", {
          id: toastId,
        });
      }
    } catch (error: any) {
      console.error("Error creating resource:", error);
      toast.error(
        error.response?.data?.message || "Failed to create resource.",
        { id: toastId },
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="animate-in fade-in slide-in-from-top-4 duration-300">
      <CardHeader>
        <CardTitle>Create New Resource</CardTitle>
        <CardDescription>
          Fill in the details below to create a new resource.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                placeholder="Enter title"
                value={formData.title}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="resourceSlug">Slug</Label>
              <div className="relative">
                <Input
                  id="resourceSlug"
                  name="resourceSlug"
                  placeholder="enter-resource-slug"
                  value={formData.resourceSlug}
                  onChange={handleChange}
                  required
                  className={
                    slugAvailable === false
                      ? "border-red-500 focus-visible:ring-red-500 pr-10"
                      : slugAvailable === true
                        ? "border-green-500 focus-visible:ring-green-500 pr-10"
                        : "pr-10"
                  }
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
                <p className="text-sm text-red-500">This slug is already taken.</p>
              )}
              {slugAvailable === true && (
                <p className="text-sm text-green-500">This slug is available.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="resourceType">Type</Label>
              <Select
                value={formData.resourceType}
                onValueChange={handleTypeChange}
              >
                <SelectTrigger id="resourceType" className="w-full">
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="resourceCategory">Category</Label>
              <Select
                value={formData.resourceCategory}
                onValueChange={handleCategoryChange}
                required
              >
                <SelectTrigger id="resourceCategory" className="w-full">
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
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="subtitle">Subtitle</Label>
            <Input
              id="subtitle"
              name="subtitle"
              placeholder="Enter subtitle"
              value={formData.subtitle}
              onChange={handleChange}
            />
          </div>

          <Button type="submit" disabled={loading || slugAvailable === false || checkingSlug} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Resource"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
