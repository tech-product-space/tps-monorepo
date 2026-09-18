"use client";

import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/gradient/components/ui/card";
import { Input } from "@/gradient/components/ui/input";
import { Button } from "@/gradient/components/ui/button";
import { Label } from "@/gradient/components/ui/label";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { courseService } from "@/gradient/services/courseService";

/** Mirrors toSlug on the API so the preview matches what gets stored. */
const toSlug = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export default function AddCourse({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [loading, setLoading] = useState(false);

  // The slug tracks the name until the admin edits it, then it stops moving —
  // it is permanent once saved, so a surprise rewrite would be costly.
  const handleNameChange = (value: string) => {
    setName(value);
    if (!slugTouched) setSlug(toSlug(value));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalisedSlug = toSlug(slug);

    if (!name.trim() || !normalisedSlug) {
      toast.error("Name and URL slug are required.");
      return;
    }

    setLoading(true);

    try {
      await courseService.createCourse({
        name: name.trim(),
        slug: normalisedSlug,
      });
      toast.success("Course created.");
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to create course.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add New Course</CardTitle>
        <CardDescription>
          Create the commercial record for a paid program. The marketing page
          itself is built separately in the website codebase.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="course-name">Course Name *</Label>
              <Input
                id="course-name"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Data Analytics Program"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="course-slug">URL Slug *</Label>
              <Input
                id="course-slug"
                value={slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  setSlug(e.target.value);
                }}
                placeholder="data-analytics"
              />
              <p className="text-xs text-muted-foreground">
                Must match the page route. Cannot be changed later.
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create Course
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
