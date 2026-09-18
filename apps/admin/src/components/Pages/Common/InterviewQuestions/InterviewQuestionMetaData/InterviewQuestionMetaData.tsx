"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { debounce } from "@/utils/debounce";
import {
  checkSlugAvailability,
  updateInterviewQuestionMetaData,
} from "@/services/interview-questions/interview-question-service";

interface MetaDetails {
  slug: string;
  metaTitle: string;
  metaDesc: string;
}

interface InterviewQuestionMetaDataProps {
  metaDetails: MetaDetails;
  id: string | undefined;
}

export default function InterviewQuestionMetaData({
  metaDetails,
  id,
}: InterviewQuestionMetaDataProps) {
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  // ✅ SINGLE SOURCE OF TRUTH (NO ID HERE)
  const [seo, setSeo] = useState({
    slug: metaDetails?.slug || "",
    metaTitle: metaDetails?.metaTitle || "",
    metaDesc: metaDetails?.metaDesc || "",
  });

  // --- Check Slug Availability ---
  const runSlugCheck = async (input: string) => {
    setSeo((prev) => ({ ...prev, slug: input }));
    setAvailable(null);

    if (!input.trim() || !id) return;

    setChecking(true);

    try {
      const res = await checkSlugAvailability(input, id);

      setSeo((prev) => ({
        ...prev,
        slug: res.slug,
      }));

      setAvailable(res.available);
    } catch (err) {
      console.error("Slug check error:", err);
      setAvailable(false);
    } finally {
      setChecking(false);
    }
  };

  // --- Debounced slug checker ---
  const debouncedSlugCheck = useMemo(
    () => debounce((value: string) => runSlugCheck(value), 500),
    []
  );

  // --- Submit handler ---
  const handleSubmit = async () => {
    if (!id) {
      alert("Invalid question");
      return;
    }

    if (
      !seo.slug.trim() ||
      !seo.metaTitle.trim() ||
      !seo.metaDesc.trim() ||
      available !== true
    ) {
      return;
    }

    try {
      setLoading(true);
      await updateInterviewQuestionMetaData(id, seo);
      setOpen(false);
    } catch (err) {
      console.error("Error updating meta data:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button onClick={() => setOpen(true)}>Meta Details</Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="space-y-4">
          <DialogHeader>
            <DialogTitle>Meta Description</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-gray-500">
            URL Example : how-to-improve-youtube
          </p>

          {/* SLUG INPUT */}
          <div className="flex flex-col gap-2">
            <Label>URL</Label>
            <Input
              placeholder="Enter the URL..."
              value={seo.slug}
              onChange={(e) => {
                const value = e.target.value;
                setSeo((prev) => ({ ...prev, slug: value }));
                debouncedSlugCheck(value);
              }}
            />
          </div>

          {checking && (
            <p className="text-sm text-blue-500">Checking availability...</p>
          )}

          {!checking && available === true && (
            <p className="text-sm text-green-600">
              ✓ URL is available:{" "}
              <span className="font-semibold">{seo.slug}</span>
            </p>
          )}

          {!checking && available === false && (
            <p className="text-sm text-red-600">
              ✗ URL already taken:{" "}
              <span className="font-semibold">{seo.slug}</span>
            </p>
          )}

          {/* META TITLE */}
          <div className="flex flex-col gap-2">
            <Label>Meta Title</Label>
            <Textarea
              placeholder="Meta Title"
              value={seo.metaTitle}
              onChange={(e) =>
                setSeo((prev) => ({
                  ...prev,
                  metaTitle: e.target.value,
                }))
              }
            />
          </div>

          {/* META DESCRIPTION */}
          <div className="flex flex-col gap-2">
            <Label>Meta Description</Label>
            <Textarea
              placeholder="Meta Description"
              value={seo.metaDesc}
              onChange={(e) =>
                setSeo((prev) => ({
                  ...prev,
                  metaDesc: e.target.value,
                }))
              }
            />
          </div>

          <DialogFooter className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>

            <Button
              onClick={handleSubmit}
              disabled={
                loading ||
                checking ||
                !seo.slug.trim() ||
                !seo.metaTitle.trim() ||
                !seo.metaDesc.trim() ||
                available !== true
              }
            >
              {loading ? "Saving..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
