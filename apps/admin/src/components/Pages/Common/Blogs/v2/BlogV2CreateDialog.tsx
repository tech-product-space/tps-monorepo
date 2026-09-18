"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { toast } from "sonner";
import { Loader2, Check, X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { slugifyUrl } from "./blogV2Form";

interface BlogV2CreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  placement?: string;
  routeSegment?: string;
}

const EMPTY = { title: "", category: "", url: "", subTitle: "" };

// Step 1 of the v2 flow as a dialog: create a minimal draft, then redirect into
// the Basic Info / Content editor.
export default function BlogV2CreateDialog({
  open,
  onOpenChange,
  placement = "blog",
  routeSegment = "blogs",
}: BlogV2CreateDialogProps) {
  const router = useRouter();
  const role = Cookies.get("currentRole");

  const [formData, setFormData] = useState(EMPTY);
  const [urlEdited, setUrlEdited] = useState(false);
  const [loading, setLoading] = useState(false);

  const { slugAvailable, checkingSlug } = useSlugAvailability(
    formData.url,
    checkSlugAvailability,
  );

  // Auto-fill the slug from the title until the user edits the url themselves.
  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;
    setFormData((prev) => ({
      ...prev,
      title,
      url: urlEdited ? prev.url : slugifyUrl(title),
    }));
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setUrlEdited(true);
    setFormData((prev) => ({ ...prev, url: slugifyUrl(e.target.value) }));
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
        url: slugifyUrl(formData.url),
        content: {
          doc: null,
          tableOfContents: [],
          subTitle: formData.subTitle,
          tags: [],
          authorDetails: null,
        },
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await addBlog(payload as any);
      const blogId = response?.blog?.blog_id;

      toast.success("Blog created. Add the details next.", { id: toastId });
      setFormData(EMPTY);
      setUrlEdited(false);
      onOpenChange(false);

      if (blogId) {
        router.push(`/${role}/${routeSegment}/edit-v2/${blogId}`);
      }
    } catch (error) {
      console.error("Error creating blog:", error);
      toast.error("Failed to create blog post.", { id: toastId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create New Blog</DialogTitle>
          <DialogDescription>
            Enter the basics to get started — you can add the content and the
            rest of the details on the next screen.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="title">
              Title <span className="text-red-500">*</span>
            </Label>
            <Input
              id="title"
              name="title"
              placeholder="Enter the title"
              value={formData.title}
              onChange={handleTitleChange}
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

          <div className="space-y-2">
            <Label htmlFor="url">
              Blog URL (slug — auto-filled from the title, editable){" "}
              <span className="text-red-500">*</span>
            </Label>
            <div className="relative">
              <Input
                id="url"
                name="url"
                placeholder="how-to-crack-pm-interviews"
                value={formData.url}
                onChange={handleUrlChange}
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
            <Label htmlFor="subTitle">
              Subtitle <span className="text-red-500">*</span>
            </Label>
            <Input
              id="subTitle"
              name="subTitle"
              placeholder="Short tagline shown under the title in the hero"
              value={formData.subTitle}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, subTitle: e.target.value }))
              }
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                loading ||
                slugAvailable === false ||
                checkingSlug ||
                !formData.subTitle.trim()
              }
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
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
