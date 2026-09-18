"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { toast } from "sonner";
import { Loader2, Check, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { addBlog, checkSlugAvailability } from "@/services/blog/blogService";
import { BLOG_CATEGORIES } from "./blogCategories";
import { useSlugAvailability } from "./useSlugAvailability";

interface BlogV2CreateFormProps {
  placement?: string;
  routeSegment?: string;
}

// Step 1 of the v2 flow: create a minimal draft, then redirect into the
// Basic Info / Content editor (mirrors gradient-admin's two-step flow).
export default function BlogV2CreateForm({
  placement = "blog",
  routeSegment = "blogs",
}: BlogV2CreateFormProps) {
  const router = useRouter();
  const role = Cookies.get("currentRole");

  const [formData, setFormData] = useState({
    title: "",
    category: "",
    url: "",
    subTitle: "",
  });
  const [loading, setLoading] = useState(false);

  const { slugAvailable, checkingSlug } = useSlugAvailability(
    formData.url,
    checkSlugAvailability,
  );

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const toastId = toast.loading("Creating blog post...");

    try {
      const payload = {
        version: 2,
        type: "draft",
        placement,
        title: formData.title,
        category: formData.category,
        url: formData.url.trim(),
        content: {
          doc: null,
          tableOfContents: [],
          subTitle: formData.subTitle,
          tags: [],
          authorDetails: null,
        },
      };

      // addBlog typing is for v1; v2 reuses the same POST /blogs/add endpoint.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await addBlog(payload as any);
      const blogId = response?.blog?.blog_id;

      toast.success("Blog created. Add the details next.", { id: toastId });

      if (blogId) {
        router.push(`/${role}/${routeSegment}/edit-v2/${blogId}`);
      } else {
        router.push(`/${role}/${routeSegment}`);
      }
    } catch (error) {
      console.error("Error creating blog:", error);
      toast.error("Failed to create blog post.", { id: toastId });
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto max-w-2xl px-5 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Create New Blog (v2)</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
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
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, category: value }))
                  }
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

            <div className="space-y-2">
              <Label htmlFor="url">
                Blog URL (lowercase letters with spaces only — no special
                characters like &amp; / ? #)
              </Label>
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
                <p className="text-sm text-red-500">
                  This slug is already taken.
                </p>
              )}
            </div>

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

            <Button
              type="submit"
              disabled={loading || slugAvailable === false || checkingSlug}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create & Continue"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
