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
import {
  assignSlugs,
  type Sluggable,
} from "@/gradient/components/TiptapEditor/import/slug";

import { projectService } from "@/gradient/services/projectService";
import type { ProjectStep } from "@/gradient/types/project";
import { docxToSteps, type DocxStep, type SplitLevel } from "./import/docxToSteps";
import {
  STEP_IMPORT_GUIDE_FILENAME,
  STEP_IMPORT_GUIDE_MARKDOWN,
} from "./import/stepImportGuide";

/**
 * Import a guide from a Google Doc — the same flow as the free-course lesson
 * importer, and deliberately not a separate one: writing a guide happens in a
 * doc long before it reaches the panel, and retyping eight steps into eight
 * editors is the thing that stops guides getting written at all.
 *
 * The .docx is parsed **in the browser**. That is what lets the embedded images
 * go through the existing upload endpoint and land as S3 keys in the same
 * ProseMirror nodes the editor writes; a server-side parse would need a second
 * converter producing an identical document shape. The API only ever sees
 * finished ProseMirror JSON.
 */

interface PreviewStep extends Sluggable, DocxStep {}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Existing steps, so the preview can show the API's de-duplication. */
  existingSteps: { slug: string }[];
  /** Receives the rows the API created, so the caller can append them. */
  onImported: (created: ProjectStep[]) => Promise<void> | void;
}

export default function StepImportDialog({
  open,
  onOpenChange,
  projectId,
  existingSteps,
  onImported,
}: Props) {
  const [splitLevel, setSplitLevel] = useState<SplitLevel>("h1");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState("");
  const [steps, setSteps] = useState<PreviewStep[] | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  // Keyed on contents rather than array identity — the parent re-sorts its
  // steps on every render, which would otherwise reset the preview.
  const existingSlugKey = existingSteps
    .map((step) => step.slug)
    .sort()
    .join("|");

  const existingSlugs = useMemo(
    () => new Set(existingSlugKey ? existingSlugKey.split("|") : []),
    [existingSlugKey],
  );

  const reset = () => {
    setFileName(null);
    setSteps(null);
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
    const blob = new Blob([STEP_IMPORT_GUIDE_MARKDOWN], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = STEP_IMPORT_GUIDE_FILENAME;
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
      const result = await docxToSteps(file, {
        splitLevel,
        projectId,
        onProgress: setProgress,
      });

      setWarnings(result.warnings);

      if (result.steps.length === 0) {
        setError(
          result.warnings[0] || "No steps could be read from that document.",
        );
        setSteps(null);
        return;
      }

      setSteps(
        assignSlugs(
          result.steps.map((step) => ({
            ...step,
            slugBase: step.title,
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
    if (!steps) return;

    const remaining = steps.filter((_, i) => i !== index);
    setSteps(remaining.length ? assignSlugs(remaining, existingSlugs) : null);
  };

  const handleImport = async () => {
    if (!steps?.length) return;

    setImporting(true);
    try {
      const response = await projectService.importSteps(
        projectId,
        steps.map((step) => ({
          title: step.title,
          slug: step.slug,
          content: step.content,
        })),
      );

      toast.success(response.message || "Steps imported.");
      reset();
      onOpenChange(false);
      await onImported(response.data || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to import steps.");
    } finally {
      setImporting(false);
    }
  };

  const duplicateCount = steps?.filter((step) => step.duplicate).length ?? 0;
  const busy = parsing || importing;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import Steps</DialogTitle>
          <DialogDescription>
            Split a Google Doc into guide steps, one per heading. Images are
            uploaded for you. Imported steps are added as drafts, so nothing
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
                  Only the heading level you pick below starts a new step. Use
                  real heading styles, then export with File &gt; Download &gt;
                  Microsoft Word (.docx).
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
                Start a new step at (this level only)
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
              htmlFor="project-docx-input"
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
              id="project-docx-input"
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
          {steps && steps.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                3. Review — {steps.length} step
                {steps.length === 1 ? "" : "s"} ready to import
              </p>

              {duplicateCount > 0 && (
                <p className="text-xs text-amber-600">
                  {duplicateCount} URL{duplicateCount === 1 ? "" : "s"} already
                  exist in this guide and will be numbered to keep them unique.
                </p>
              )}

              <div className="divide-y rounded-md border">
                {steps.map((step, index) => (
                  <div
                    key={`${step.slug}-${index}`}
                    className="flex items-start justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {step.title}
                      </p>
                      {step.excerpt && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {step.excerpt}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px]"
                        >
                          {step.slug}
                        </Badge>
                        {step.duplicate && (
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
          <Button onClick={handleImport} disabled={!steps?.length || busy}>
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Import {steps?.length ?? 0} step
                {steps?.length === 1 ? "" : "s"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
