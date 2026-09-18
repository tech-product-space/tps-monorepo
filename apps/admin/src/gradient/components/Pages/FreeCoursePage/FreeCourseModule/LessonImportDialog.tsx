"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import { Badge } from "@/gradient/components/ui/badge";
import { Label } from "@/gradient/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
import { lessonService } from "@/gradient/services/freeCourse/lesson/lesson.service";
import type { FreeCourseLesson } from "@/gradient/types/freeCourse";
import {
  docxToLessons,
  type DocxLesson,
  type SplitLevel,
} from "../import/docxToLessons";
import { assignSlugs, type Sluggable } from "@/gradient/components/TiptapEditor/import/slug";
import {
  IMPORT_GUIDE_FILENAME,
  IMPORT_GUIDE_MARKDOWN,
} from "../import/importGuide";

interface PreviewLesson extends Sluggable, DocxLesson {}

interface LessonImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleId: string;
  /** S3 entity id for images pulled out of the document. */
  courseId: string;
  /** Existing lessons, so the preview can show the API's de-duplication. */
  existingLessons: { slug: string }[];
  /** Receives the rows the API created, so the caller can append them. */
  onImported: (created: FreeCourseLesson[]) => Promise<void> | void;
}

export default function LessonImportDialog({
  open,
  onOpenChange,
  moduleId,
  courseId,
  existingLessons,
  onImported,
}: LessonImportDialogProps) {
  const [splitLevel, setSplitLevel] = useState<SplitLevel>("h1");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState("");
  const [lessons, setLessons] = useState<PreviewLesson[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Keyed on contents rather than array identity — the parent re-sorts its
  // lessons on every render, which would otherwise reset the preview.
  const existingSlugKey = existingLessons
    .map((l) => l.slug)
    .sort()
    .join("|");

  const existingSlugs = useMemo(
    () => new Set(existingSlugKey ? existingSlugKey.split("|") : []),
    [existingSlugKey],
  );

  const reset = () => {
    setFileName(null);
    setLessons(null);
    setWarnings([]);
    setError(null);
    setProgress("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const close = () => {
    if (importing || parsing) return;
    reset();
    onOpenChange(false);
  };

  const handleDownloadGuide = () => {
    const blob = new Blob([IMPORT_GUIDE_MARKDOWN], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = IMPORT_GUIDE_FILENAME;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setError(
        "That isn't a .docx file. In Google Docs use File > Download > Microsoft Word (.docx).",
      );
      return;
    }

    reset();
    setFileName(file.name);
    setParsing(true);

    try {
      const result = await docxToLessons(file, {
        splitLevel,
        courseId,
        onProgress: setProgress,
      });

      setWarnings(result.warnings);

      if (result.lessons.length === 0) {
        setError(
          result.warnings[0] ||
            "No lessons could be read from that document.",
        );
        setLessons(null);
        return;
      }

      setLessons(
        assignSlugs(
          result.lessons.map((lesson) => ({
            ...lesson,
            slugBase: lesson.title,
            slug: "",
            duplicate: false,
          })),
          existingSlugs,
        ),
      );
    } catch (err: any) {
      console.error("docx import failed", err);
      setError(
        err?.message || "Could not read that document. Try re-exporting it.",
      );
    } finally {
      setParsing(false);
      setProgress("");
    }
  };

  // Dropping a row frees the slug it was holding, so the rest are re-numbered.
  const handleDrop = (index: number) => {
    if (!lessons) return;

    const remaining = lessons.filter((_, i) => i !== index);
    setLessons(remaining.length ? assignSlugs(remaining, existingSlugs) : null);
  };

  const handleImport = async () => {
    if (!lessons?.length) return;

    setImporting(true);
    try {
      const response = await lessonService.importLessons(
        moduleId,
        lessons.map((lesson) => ({
          title: lesson.title,
          slug: lesson.slug,
          content: lesson.content,
        })),
      );

      toast.success(response.message || "Lessons imported.");
      reset();
      onOpenChange(false);
      await onImported(response.data || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to import lessons.");
    } finally {
      setImporting(false);
    }
  };

  const duplicateCount = lessons?.filter((l) => l.duplicate).length ?? 0;
  const busy = parsing || importing;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import Lessons</DialogTitle>
          <DialogDescription>
            Split a Google Doc into lessons, one per heading. Images are
            uploaded for you. Imported lessons are created as drafts, so nothing
            goes live until you publish it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1 */}
          <div className="rounded-md border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">1. Prepare the doc</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Only the heading level you pick below starts a new lesson.
                  Use real heading styles, then export with File &gt; Download
                  &gt; Microsoft Word (.docx).
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={handleDownloadGuide}
              >
                <Download className="mr-2 h-3.5 w-3.5" />
                Formatting guide
              </Button>
            </div>
          </div>

          {/* Step 2 */}
          <div className="space-y-3">
            <p className="text-sm font-medium">2. Upload it</p>

            <div className="space-y-2">
              <Label className="text-xs">
                Start a new lesson at (this level only)
              </Label>
              <Select
                value={splitLevel}
                onValueChange={(value) => setSplitLevel(value as SplitLevel)}
                disabled={busy}
              >
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="h1">Heading 1</SelectItem>
                  <SelectItem value="h2">Heading 2</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <label
              htmlFor="docx-input"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6 text-center transition-colors hover:bg-muted/50"
            >
              {parsing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {progress || "Working..."}
                  </span>
                </>
              ) : (
                <>
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {fileName || "Click to choose a .docx file"}
                  </span>
                </>
              )}
            </label>
            <input
              ref={inputRef}
              id="docx-input"
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
              {warnings.map((warning, i) => (
                <p key={i}>{warning}</p>
              ))}
            </div>
          )}

          {/* Step 3 */}
          {lessons && lessons.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                3. Review — {lessons.length} lesson
                {lessons.length === 1 ? "" : "s"} ready to import
              </p>

              {duplicateCount > 0 && (
                <p className="text-xs text-amber-600">
                  {duplicateCount} slug
                  {duplicateCount === 1 ? "" : "s"} already exist in this module
                  and will be numbered to keep them unique.
                </p>
              )}

              <div className="divide-y rounded-md border">
                {lessons.map((lesson, index) => (
                  <div
                    key={`${lesson.slug}-${index}`}
                    className="flex items-start justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {lesson.title}
                      </p>
                      {lesson.excerpt && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {lesson.excerpt}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px]"
                        >
                          {lesson.slug}
                        </Badge>
                        {lesson.duplicate && (
                          <Badge
                            variant="outline"
                            className="border-amber-500 text-[10px] text-amber-600"
                          >
                            renamed
                          </Badge>
                        )}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => handleDrop(index)}
                      disabled={busy}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!lessons?.length || busy}>
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Import {lessons?.length ?? 0} lesson
                {lessons?.length === 1 ? "" : "s"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
