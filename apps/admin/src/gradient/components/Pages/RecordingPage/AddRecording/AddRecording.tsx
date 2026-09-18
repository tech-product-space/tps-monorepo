"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  Link2,
  Loader2,
  Video,
  X,
} from "lucide-react";
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
import { Badge } from "@/gradient/components/ui/badge";
import { Separator } from "@/gradient/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";

import { useRecordingStore } from "@/gradient/lib/store/useRecordingStore";
import { recordingService } from "@/gradient/services/recordingService";
import { useSlugAvailability } from "@/gradient/hooks/useSlugAvailability";
import { RecordingCategory } from "@/gradient/types/recording";
import { RECORDING_FORMATS } from "@/gradient/constants/recording";


interface Props {
  categories: RecordingCategory[];
  onSuccess: () => void;
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const SITE = process.env.NEXT_PUBLIC_FRONTEND_URL?.replace(/^https?:\/\//, "")
  .replace(/\/$/, "");

/**
 * Creates the row and nothing else — video, thumbnail, speakers and page
 * content are the editor's job, which this navigates to on success.
 *
 * It asks for four things and explains what happens next, rather than pretending
 * to be a short version of the editor. The two required fields are the two that
 * cannot be fixed cheaply later: the slug becomes a URL people hold, and an
 * uncategorised recording is invisible to the only navigation the section has.
 */
/** Radix's Select reserves "" for "nothing selected"; see `RecordingEditor`. */
const NO_FORMAT = "none";

export default function AddRecording({ categories, onSuccess }: Props) {
  const { setShowCreateForm } = useRecordingStore();
  const router = useRouter();

  const [form, setForm] = useState({
    title: "",
    slug: "",
    categoryId: "",
    format: "",
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const { slugAvailable, checkingSlug } = useSlugAvailability(
    form.slug,
    recordingService.checkSlugAvailability,
  );

  const titleError = !form.title.trim() ? "Give it a title." : null;
  const categoryError = !form.categoryId
    ? "Pick a category — it decides which chip this appears under."
    : null;
  const slugError = slugAvailable === false ? "That slug is already taken." : null;

  // Errors appear after the first submit, not while somebody is still typing
  // the first character of an empty form.
  const showErrors = submitted;
  const blocked = Boolean(titleError || categoryError || slugError);

  const handleTitle = (value: string) => {
    setForm((prev) => ({
      ...prev,
      title: value,
      // Follows the title until the admin edits the slug by hand, after which
      // it is theirs — retyping the title must not silently undo their URL.
      slug: slugTouched ? prev.slug : slugify(value),
    }));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);

    if (blocked) return;

    setLoading(true);

    try {
      const response = await recordingService.createRecording({
        title: form.title.trim(),
        slug: form.slug || undefined,
        categoryId: form.categoryId || null,
        format: form.format || null,
      });

      if (!response.success) {
        toast.error(response.message || "Could not create the recording");
        return;
      }

      toast.success("Recording created — add the video next");
      setShowCreateForm(false);
      onSuccess();
      router.push(`/recordings/${response.data.id}`);
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || "Could not create the recording",
      );
    } finally {
      setLoading(false);
    }
  };

  // Ctrl/Cmd+Enter to create, Escape to back out. The form is short enough that
  // reaching for the mouse is the slowest part of adding several in a row.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSubmit();
      }
      if (e.key === "Escape" && !loading) setShowCreateForm(false);
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>New recording</CardTitle>
        <CardDescription>
          Creates a draft and opens the editor. Nothing is public until you
          publish it there.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ── what it is called ── */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                autoFocus
                value={form.title}
                onChange={(e) => handleTitle(e.target.value)}
                placeholder="Gen-AI Powered Data Workflows"
                aria-invalid={showErrors && Boolean(titleError)}
              />
              {showErrors && titleError && (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {titleError}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">URL</Label>
              <div className="relative">
                <Input
                  id="slug"
                  value={form.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setForm((prev) => ({
                      ...prev,
                      slug: slugify(e.target.value),
                    }));
                  }}
                  placeholder="gen-ai-powered-data-workflows"
                  className="pr-9"
                  aria-invalid={slugAvailable === false}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  {checkingSlug ? (
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  ) : slugAvailable === true ? (
                    <Check className="h-4 w-4 text-green-600" />
                  ) : slugAvailable === false ? (
                    <X className="h-4 w-4 text-destructive" />
                  ) : null}
                </div>
              </div>

              {/* The whole address, not the fragment — an admin should see what
                  they are committing people to before they commit to it. */}
              <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                <Link2 className="h-3.5 w-3.5 shrink-0" />
                <span className="font-mono">
                  {SITE ?? ""}/recordings/
                  <span className="text-foreground">
                    {form.slug || "\u2026"}
                  </span>
                </span>
                {slugAvailable === false ? (
                  <span className="text-destructive">&middot; already taken</span>
                ) : (
                  <span>&middot; hard to change once people hold the link</span>
                )}
              </p>
            </div>
          </div>

          <Separator />

          {/* ── where it belongs ── */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Category *</Label>
              <Select
                value={form.categoryId}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, categoryId: value }))
                }
              >
                <SelectTrigger
                  className="w-full"
                  aria-invalid={showErrors && Boolean(categoryError)}
                >
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                      {!category.isActive && " (hidden)"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {showErrors && categoryError ? (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {categoryError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  The chip somebody clicks to find this.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Format</Label>
              <Select
                value={form.format || NO_FORMAT}
                onValueChange={(v) =>
                  setForm((prev) => ({
                    ...prev,
                    format: v === NO_FORMAT ? "" : v,
                  }))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="No badge" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FORMAT}>No badge</SelectItem>
                  {RECORDING_FORMATS.map((format) => (
                    <SelectItem key={format} value={format}>
                      {format}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.format ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  Card badge:
                  <Badge variant="secondary">{form.format}</Badge>
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Optional. What kind of session this was — the same kinds an
                  event can be. No format, no badge.
                </p>
              )}
            </div>
          </div>

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Video className="h-3.5 w-3.5 shrink-0" />
              Next: the YouTube link, thumbnail and page content.
            </p>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowCreateForm(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading || checkingSlug}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create and edit
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
