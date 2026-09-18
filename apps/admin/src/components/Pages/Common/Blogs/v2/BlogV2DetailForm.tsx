"use client";

import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { Loader2, Check, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { uploadBlogFile, checkSlugAvailability } from "@/services/blog/blogService";
import { BLOG_CATEGORIES } from "./blogCategories";
import { useSlugAvailability } from "./useSlugAvailability";
import { slugifyUrl, type DetailsValues } from "./blogV2Form";

interface BlogV2DetailFormProps {
  value: DetailsValues;
  onChange: (value: DetailsValues) => void;
  blogId?: number | string;
  originalUrl?: string;
}

export default function BlogV2DetailForm({
  value,
  onChange,
  blogId,
  originalUrl,
}: BlogV2DetailFormProps) {
  const set = (key: keyof DetailsValues, val: unknown) =>
    onChange({ ...value, [key]: val });

  const checkSlug = useCallback(
    (slug: string) => checkSlugAvailability(slug, blogId),
    [blogId],
  );
  const { slugAvailable, checkingSlug } = useSlugAvailability(
    value.url,
    checkSlug,
    originalUrl,
  );

  const thumbInputRef = useRef<HTMLInputElement>(null);
  const authorInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "thumbnailSrc" | "authorImgSrc",
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const res = await uploadBlogFile(file);
      set(field, res.fileUrl);
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
      );
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-6 w-full max-w-4xl mx-auto px-5 py-6">
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
              value={value.title}
              onChange={(e) => set("title", e.target.value)}
              placeholder="Enter blog title"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="subTitle">
              Subtitle <span className="text-destructive">*</span>
            </Label>
            <Input
              id="subTitle"
              value={value.subTitle}
              onChange={(e) => set("subTitle", e.target.value)}
              placeholder="Short tagline shown under the title in the hero"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5 w-full">
              <Label htmlFor="category">Category</Label>
              <Select
                value={value.category}
                onValueChange={(v) => set("category", v)}
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
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="url">
                Blog URL (slug) <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  id="url"
                  value={value.url}
                  onChange={(e) => set("url", slugifyUrl(e.target.value))}
                  placeholder="how-to-crack-pm-interviews"
                  className={`text-sm pr-10 ${
                    slugAvailable === false
                      ? "border-red-500 focus-visible:ring-red-500"
                      : slugAvailable === true
                        ? "border-green-500 focus-visible:ring-green-500"
                        : ""
                  }`}
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
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="readTime">Read Time (minutes)</Label>
              <Input
                id="readTime"
                type="number"
                value={value.readTime}
                onChange={(e) => set("readTime", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="publishedDate">Published Date</Label>
              <Input
                id="publishedDate"
                type="date"
                value={value.publishedDate}
                onChange={(e) => set("publishedDate", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Select
                value={value.status}
                onValueChange={(v) => set("status", v)}
              >
                <SelectTrigger id="status" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="publish">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="space-y-1.5">
              <Label htmlFor="placement">Placement</Label>
              <Select
                value={value.placement}
                onValueChange={(v) => set("placement", v)}
              >
                <SelectTrigger id="placement" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blog">Blog (/blogs)</SelectItem>
                  <SelectItem value="standalone">
                    Standalone (root /slug)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="flex items-center justify-between border rounded-md p-3">
              <div>
                <Label className="text-sm font-medium">Featured Blog</Label>
                <p className="text-xs text-muted-foreground">
                  Appears in the featured section
                </p>
              </div>
              <Switch
                checked={value.featured}
                onCheckedChange={(v) => set("featured", v)}
              />
            </div>
            <div className="flex items-center justify-between border rounded-md p-3">
              <div>
                <Label className="text-sm font-medium">Recommended</Label>
                <p className="text-xs text-muted-foreground">
                  Appears in recommended blogs
                </p>
              </div>
              <Switch
                checked={value.recommended}
                onCheckedChange={(v) => set("recommended", v)}
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
            <Label htmlFor="authorName">Name</Label>
            <Input
              id="authorName"
              value={value.authorName}
              onChange={(e) => set("authorName", e.target.value)}
              placeholder="Author name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="authorCompany">Company</Label>
            <Input
              id="authorCompany"
              value={value.authorCompany}
              onChange={(e) => set("authorCompany", e.target.value)}
              placeholder="Company name"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="authorDesignation">Designation</Label>
            <Input
              id="authorDesignation"
              value={value.authorDesignation}
              onChange={(e) => set("authorDesignation", e.target.value)}
              placeholder="e.g. Senior Engineer"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Profile Image</Label>
            <input
              ref={authorInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleUpload(e, "authorImgSrc")}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => authorInputRef.current?.click()}
              className="w-fit"
            >
              {value.authorImgSrc ? "Change Image" : "Upload Image"}
            </Button>
            {value.authorImgSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={value.authorImgSrc}
                alt="author"
                className="w-20 h-auto rounded-md object-cover mt-2 border"
              />
            )}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="authorImgAlt">Profile Image Alt Text</Label>
            <Input
              id="authorImgAlt"
              value={value.authorImgAlt}
              onChange={(e) => set("authorImgAlt", e.target.value)}
              placeholder="Alt text for author image"
            />
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
            <Label>Thumbnail Image</Label>
            <input
              ref={thumbInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleUpload(e, "thumbnailSrc")}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => thumbInputRef.current?.click()}
              className="w-fit"
            >
              {value.thumbnailSrc ? "Change Thumbnail" : "Upload Thumbnail"}
            </Button>
            {value.thumbnailSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={value.thumbnailSrc}
                alt="thumbnail preview"
                className="w-40 h-auto rounded mt-2 border"
              />
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="thumbnailAlt">Thumbnail Alt Text</Label>
            <Input
              id="thumbnailAlt"
              value={value.thumbnailAlt}
              onChange={(e) => set("thumbnailAlt", e.target.value)}
              placeholder="Describe the thumbnail image"
            />
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
            <Label htmlFor="metaTitle">Meta Title</Label>
            <Input
              id="metaTitle"
              value={value.metaTitle}
              onChange={(e) => set("metaTitle", e.target.value)}
              placeholder="SEO title"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="metaDesc">Meta Description</Label>
            <Textarea
              id="metaDesc"
              value={value.metaDesc}
              onChange={(e) => set("metaDesc", e.target.value)}
              placeholder="SEO description..."
              rows={3}
              className="resize-none"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
