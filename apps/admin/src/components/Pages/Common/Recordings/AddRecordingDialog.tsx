"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, X } from "lucide-react";

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

import { useNotification } from "@/helpers/NotificationContext";
import { useAutomationBasePath } from "@/hooks/useAutomationBasePath";
import {
  checkSlugAvailability,
  createRecording,
} from "@/services/recordings/recordingsService";
import { RECORDING_FORMATS, slugifyRecording } from "@/utils/recording";
import { RecordingCategory } from "@/types/recording";

interface Props {
  categories: RecordingCategory[];
  onCreated: () => void;
  onClose: () => void;
}

/**
 * Creates a row and says so, rather than reading as a short version of the
 * editor.
 *
 * **Two required fields, and they are the two that are expensive to fix later.**
 * The slug becomes a URL people hold; an uncategorised recording is invisible to
 * the only navigation the section has. Everything else — the YouTube link, the
 * thumbnail, the page content — can wait for the editor, and the footer says so.
 */
export default function AddRecordingDialog({
  categories,
  onCreated,
  onClose,
}: Props) {
  const router = useRouter();
  const basePath = useAutomationBasePath();
  const { showNotification } = useNotification();

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [format, setFormat] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);

  // The slug follows the title until somebody edits it by hand, at which point
  // it is theirs and must stop moving under them.
  useEffect(() => {
    if (!slugTouched) setSlug(slugifyRecording(title));
  }, [title, slugTouched]);

  useEffect(() => {
    if (!slug) {
      setSlugAvailable(null);
      return;
    }

    setCheckingSlug(true);
    const timer = setTimeout(async () => {
      try {
        const result = await checkSlugAvailability(slug);
        setSlugAvailable(result?.available ?? true);
      } catch {
        setSlugAvailable(null);
      } finally {
        setCheckingSlug(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [slug]);

  const titleError = submitted && !title.trim() ? "Give it a title." : null;
  const categoryError =
    submitted && !categoryId
      ? "Pick a category — it is the only way anyone browses this section."
      : null;

  const handleCreate = async () => {
    setSubmitted(true);

    if (!title.trim() || !categoryId) return;
    if (slugAvailable === false) {
      showNotification("error", "That URL is already taken");
      return;
    }

    setSaving(true);
    try {
      const response = await createRecording({
        title: title.trim(),
        slug: slug || undefined,
        categoryId,
        // Optional, unlike the two above: a recording with no format simply
        // carries no badge, and that is a fix of one Select in the editor rather
        // than a URL somebody has already shared.
        format: format || null,
      });

      showNotification("success", "Recording created");
      onCreated();
      router.push(`${basePath}/recordings/edit/${response.data.id}`);
    } catch (error: any) {
      showNotification(
        "error",
        error?.response?.data?.message || "Could not create the recording"
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="space-y-5 text-left"
      // Adding several recordings in a row is the case worth optimising, and
      // reaching for the mouse is the slow part.
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleCreate();
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="space-y-2">
        <Label>Title *</Label>
        <Input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Breaking into Product Management in 2026"
        />
        {titleError && <p className="text-xs text-red-600">{titleError}</p>}
      </div>

      <div className="space-y-2">
        <Label>URL</Label>
        <div className="relative">
          <Input
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(slugifyRecording(e.target.value));
            }}
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            {checkingSlug ? (
              <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
            ) : slugAvailable === true ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : slugAvailable === false ? (
              <X className="h-4 w-4 text-red-600" />
            ) : null}
          </div>
        </div>
        {/* Shown whole, not as a fragment — an admin should see what they are
            committing people to before they commit. */}
        <p className="text-xs text-gray-500">
          theproductspace.co.in/recordings/{slug || "…"}
          {slugAvailable === false && (
            <span className="ml-2 text-red-600">Already taken</span>
          )}
          {slugAvailable === true && (
            <span className="ml-2 text-green-600">Available</span>
          )}
        </p>
      </div>

      <div className="space-y-2">
        <Label>Category *</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger>
            <SelectValue placeholder="Pick a category" />
          </SelectTrigger>
          <SelectContent>
            {categories
              .filter((category) => category.isActive)
              .map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        {categoryError && (
          <p className="text-xs text-red-600">{categoryError}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Format</Label>
        <Select value={format} onValueChange={setFormat}>
          <SelectTrigger>
            <SelectValue placeholder="No badge" />
          </SelectTrigger>
          <SelectContent>
            {RECORDING_FORMATS.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-500">
          The badge on the listing card — what kind of session this was.
          Masterclass is the standalone one, for a session that was never run as
          a live event.
        </p>
      </div>

      <div className="flex items-center justify-between border-t border-gray-200 pt-4">
        <p className="text-xs text-gray-500">
          Next: the YouTube link, thumbnail and page content.
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create and edit
          </Button>
        </div>
      </div>
    </div>
  );
}
