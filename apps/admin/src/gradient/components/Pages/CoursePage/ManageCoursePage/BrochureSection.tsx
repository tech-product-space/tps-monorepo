"use client";

import { useRef, useState } from "react";
import {
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/gradient/components/ui/card";
import { Button } from "@/gradient/components/ui/button";
import { courseService } from "@/gradient/services/courseService";
import { uploadFile } from "@/gradient/services/fileUpload";
import { Course } from "@/gradient/types/course";

export default function BrochureSection({
  course,
  onSaved,
}: {
  course: Course;
  onSaved: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  const brochure = course.brochure || {};
  const hasBrochure = Boolean(brochure.fileKey);

  const handleUpload = async (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("The brochure must be a PDF.");
      return;
    }

    setUploading(true);

    try {
      const key = await uploadFile(file, "course", course.id);
      await courseService.saveBrochure(course.id, {
        fileKey: key,
        fileName: file.name,
      });
      toast.success("Brochure uploaded.");
      onSaved();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Upload failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    setBusy(true);

    try {
      await courseService.removeBrochure(course.id);
      toast.success("Brochure removed — the download button is now hidden.");
      onSaved();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to remove.");
    } finally {
      setBusy(false);
    }
  };

  const copyLink = async () => {
    if (!course.brochureLink) return;

    try {
      await navigator.clipboard.writeText(course.brochureLink);
      toast.success("Brochure link copied.");
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Curriculum Brochure</CardTitle>
          <CardDescription>
            The PDF sent to anyone who requests the curriculum. Uploading one
            puts the &ldquo;Download Curriculum&rdquo; button live on the course
            page within 5 minutes; removing it takes the button down.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-5">
          {hasBrochure ? (
            <div className="flex flex-wrap items-center gap-4 rounded-lg border p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                <FileText size={20} />
              </div>

              <div className="min-w-0 flex-grow">
                <p className="truncate text-sm font-medium">
                  {brochure.fileName}
                </p>
                <p className="text-xs text-muted-foreground">
                  Uploaded{" "}
                  {brochure.uploadedAt
                    ? new Date(brochure.uploadedAt).toLocaleString()
                    : "—"}
                </p>
              </div>

              <div className="flex gap-2">
                {course.brochureFileUrl && (
                  <Button variant="outline" size="sm" asChild>
                    <a
                      href={course.brochureFileUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
                      Open
                    </a>
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={handleRemove}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No brochure uploaded yet.
            </p>
          )}

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
            }}
          />

          <Button
            variant={hasBrochure ? "outline" : "default"}
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {hasBrochure ? "Replace Brochure" : "Upload Brochure"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Shareable Link</CardTitle>
          <CardDescription>
            Paste this into the curriculum email, WhatsApp or an ad. It always
            resolves to the current file, so replacing the brochure never breaks
            links you have already sent.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-muted px-3 py-2 text-xs">
              {course.brochureLink || "—"}
            </code>
            <Button
              variant="outline"
              size="sm"
              onClick={copyLink}
              disabled={!hasBrochure}
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              Copy link
            </Button>
          </div>

          {!hasBrochure && (
            <p className="mt-2 text-xs text-muted-foreground">
              The link only resolves once a brochure is uploaded.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
