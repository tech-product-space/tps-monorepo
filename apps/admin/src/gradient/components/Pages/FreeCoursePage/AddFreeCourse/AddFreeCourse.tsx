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
import { Loader2, Check, X } from "lucide-react";
import { useFreeCourseStore } from "@/gradient/lib/store/useFreeCourseStore";
import { freeCourseService } from "@/gradient/services/freeCourseService";
import { toast } from "sonner";
import { SlugInput } from "@/gradient/components/Common/SlugInput";

interface AddFreeCourseProps {
  onSuccess: () => void;
}

export default function AddFreeCourse({ onSuccess }: AddFreeCourseProps) {
  const { setShowCreateForm } = useFreeCourseStore();

  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    subTitle: "",
    description: "",
  });

  const [loading, setLoading] = useState(false);
  const [isSlugAvailable, setIsSlugAvailable] = useState<boolean | null>(null);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const toastId = toast.loading("Creating free course...");

    try {
      const payload = {
        title: formData.title,
        slug: formData.slug,
        subTitle: formData.subTitle,
        description: formData.description,
      };

      const response = await freeCourseService.createFreeCourse(payload);

      if (response.success) {
        toast.success("Free course created successfully!", { id: toastId });
        setShowCreateForm(false);
        onSuccess();
      } else {
        toast.error(response.message || "Failed to create free course.", {
          id: toastId,
        });
      }
    } catch (error: any) {
      console.error("Error creating free course:", error);
      toast.error(
        error.response?.data?.message || "Failed to create free course.",
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
          <CardTitle>Create Free Course</CardTitle>
          <CardDescription>
            Enter the basic information to create a new course.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              name="title"
              placeholder="e.g. Introduction to React"
              value={formData.title}
              onChange={handleChange}
              required
            />
          </div>

          <SlugInput
            id="slug"
            name="slug"
            label="URL Slug"
            placeholder="e.g. intro-to-react"
            value={formData.slug}
            onChange={handleChange}
            required
            checkService={freeCourseService.checkSlugAvailability}
            onAvailabilityChange={setIsSlugAvailable}
          />

          <div className="space-y-2">
            <Label htmlFor="subTitle">Subtitle</Label>
            <Input
              id="subTitle"
              name="subTitle"
              placeholder="A short summary of the course"
              value={formData.subTitle}
              onChange={handleChange}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Tell us about the course..."
              rows={4}
              value={formData.description}
              onChange={handleChange}
              required
            />
          </div>

          <div className="flex justify-end gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowCreateForm(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading || isSlugAvailable === false}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Create Course"
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
