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
import { useBlogStore } from "@/gradient/lib/store/useBlogStore";
import { blogService } from "@/gradient/services/blogService";
import { toast } from "sonner";
import { useSlugAvailability } from "@/gradient/hooks/useSlugAvailability";
import {
  BLOG_CATEGORIES,
  BlogCategory,
} from "@/gradient/components/constants/blogCategories";

interface AddBlogProps {
  onSuccess: () => void;
}

export default function AddBlog({ onSuccess }: AddBlogProps) {
  const { setShowCreateForm } = useBlogStore();

  const [formData, setFormData] = useState({
    title: "",
    category: "" as BlogCategory | "",
    url: "",
    subTitle: "",
  });

  const [loading, setLoading] = useState(false);
  const { slugAvailable, checkingSlug } = useSlugAvailability(formData.url, blogService.checkSlugAvailability);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleCategoryChange = (value: BlogCategory) => {
    setFormData((prev) => ({ ...prev, category: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const toastId = toast.loading("Creating blog post...");

    try {
      const payload = {
        title: formData.title,
        category: formData.category,
        url: formData.url,
        subTitle: formData.subTitle,
      };

      const response = await blogService.createBlog(payload);

      if (response.status === 201 || response.status === 200) {
        toast.success("Blog post created successfully!", { id: toastId });

        setFormData({
          title: "",
          category: "",
          url: "",
          subTitle: "",
        });

        setShowCreateForm(false);
        onSuccess();
      }
    } catch (error: any) {
      console.error("Error creating blog:", error);
      toast.error(
        error.response?.data?.message || "Failed to create blog post.",
        { id: toastId },
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="animate-in fade-in slide-in-from-top-4 duration-300">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Create New Blog</CardTitle>
          <CardDescription>
            Fill in the details below to create a new blog post.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Title + Category */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                name="title"
                placeholder="Enter the title"
                value={formData.title}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2 w-full">
              <Label htmlFor="category">Category</Label>

              <Select
                value={formData.category}
                onValueChange={handleCategoryChange}
                required
              >
                <SelectTrigger id="category" className="w-full rounded-md">
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
            </div>
          </div>

          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="url">URL Slug</Label>
            <div className="relative">
              <Input
                id="url"
                name="url"
                placeholder="Enter the url"
                value={formData.url}
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

          {/* Subtitle */}
          <div className="space-y-2">
            <Label htmlFor="subTitle">Subtitle</Label>
            <Input
              id="subTitle"
              name="subTitle"
              placeholder="Enter the Subtitle"
              value={formData.subTitle}
              onChange={handleChange}
            />
          </div>

          {/* Submit */}
          <Button type="submit" disabled={loading || slugAvailable === false || checkingSlug} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Blog Post"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
