"use client";

import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/gradient/components/ui/card";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { Button } from "@/gradient/components/ui/button";
import { Switch } from "@/gradient/components/ui/switch";
import { courseService } from "@/gradient/services/courseService";
import { Course } from "@/gradient/types/course";

export default function OverviewSection({
  course,
  onSaved,
}: {
  course: Course;
  onSaved: () => void;
}) {
  const [name, setName] = useState(course.name);
  const [isPublished, setIsPublished] = useState(course.isPublished);
  const [saving, setSaving] = useState(false);

  const publicUrl = `${process.env.NEXT_PUBLIC_FRONTEND_URL}/${course.slug}`;

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Course name is required.");
      return;
    }

    setSaving(true);

    try {
      await courseService.updateCourse(course.id, {
        name: name.trim(),
        isPublished,
      });
      toast.success("Course updated.");
      onSaved();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Course Details</CardTitle>
          <CardDescription>
            How this course is identified across the admin panel and on leads.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name">Course Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>URL Slug</Label>
              <div className="flex items-center gap-2">
                <Input value={course.slug} disabled />
                <Button variant="outline" size="icon" asChild>
                  <a href={publicUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Locked — the live page URL and every existing lead key off it.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="text-sm font-medium">Published</p>
              <p className="text-xs text-muted-foreground">
                While unpublished, the website ignores these settings and falls
                back to the values built into the page.
              </p>
            </div>
            <Switch checked={isPublished} onCheckedChange={setIsPublished} />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </div>
    </div>
  );
}
