"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Copy, Loader2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import { Textarea } from "@/gradient/components/ui/textarea";
import { Badge } from "@/gradient/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { moduleService } from "@/gradient/services/freeCourse/module/module.service";
import type { FreeCourseModule } from "@/gradient/types/freeCourse";
import { parseModulesJson, type ParsedModule } from "../import/parseModulesJson";
import {
  MODULE_AI_PROMPT,
  MODULE_JSON_EXAMPLE,
} from "../import/moduleImportPrompt";

interface ModuleImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  /** Existing modules, so the preview can show the API's de-duplication. */
  existingModules: FreeCourseModule[];
  onImported: () => Promise<void> | void;
}

export default function ModuleImportDialog({
  open,
  onOpenChange,
  courseId,
  existingModules,
  onImported,
}: ModuleImportDialogProps) {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ParsedModule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // The parent rebuilds its modules array on every render, so memoising on the
  // array identity would re-run the parse effect and restore dropped rows. Key
  // on the slug contents, which only change when modules are actually added.
  const existingSlugKey = existingModules
    .map((m) => m.slug)
    .sort()
    .join("|");

  const existingSlugs = useMemo(
    () => new Set(existingSlugKey ? existingSlugKey.split("|") : []),
    [existingSlugKey],
  );

  const reset = () => {
    setRaw("");
    setParsed(null);
    setError(null);
  };

  const close = () => {
    if (importing) return;
    reset();
    onOpenChange(false);
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(MODULE_AI_PROMPT);
      toast.success("Prompt copied. Paste it into an AI chat with your outline.");
    } catch {
      toast.error("Could not copy. Select the prompt and copy it manually.");
    }
  };

  // Parse as soon as something is pasted. Debounced so a hand-typed edit does
  // not flash an error on every keystroke while the JSON is still incomplete.
  useEffect(() => {
    if (!raw.trim()) {
      setParsed(null);
      setError(null);
      return;
    }

    const timer = setTimeout(() => {
      const result = parseModulesJson(raw, existingSlugs);
      setError(result.error);
      setParsed(result.error ? null : result.modules);
    }, 250);

    return () => clearTimeout(timer);
  }, [raw, existingSlugs]);

  // Dropping a row frees the slug it was holding, so the rest are re-numbered.
  const handleDrop = (index: number) => {
    if (!parsed) return;

    const remaining = parsed.filter((_, i) => i !== index);
    if (remaining.length === 0) {
      setParsed(null);
      return;
    }

    const result = parseModulesJson(
      JSON.stringify(
        remaining.map((m) => ({
          title: m.title,
          subTitle: m.subTitle || undefined,
          duration: m.overview.moduleDuration || undefined,
          overview: m.overview.moduleDescription.length
            ? m.overview.moduleDescription
            : undefined,
        })),
      ),
      existingSlugs,
    );
    setParsed(result.modules);
  };

  const handleImport = async () => {
    if (!parsed?.length) return;

    setImporting(true);
    try {
      const response = await moduleService.importModules(
        courseId,
        parsed.map((m) => ({
          title: m.title,
          slug: m.slug,
          subTitle: m.subTitle || undefined,
          overview: m.overview,
        })),
      );

      toast.success(response.message || "Modules imported.");
      reset();
      onOpenChange(false);
      await onImported();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to import modules.");
    } finally {
      setImporting(false);
    }
  };

  const duplicateCount = parsed?.filter((m) => m.duplicate).length ?? 0;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import Modules</DialogTitle>
          <DialogDescription>
            Turn a course outline into modules in one step. Imported modules are
            created as drafts, so nothing goes live until you publish it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1 */}
          <div className="rounded-md border p-4">
            <p className="text-sm font-medium">1. Get the JSON</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Copy the prompt, paste it into any AI chat followed by your raw
              syllabus, then copy the JSON it returns.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={handleCopyPrompt}
            >
              <Copy className="mr-2 h-3.5 w-3.5" />
              Copy AI prompt
            </Button>
          </div>

          {/* Step 2 */}
          <div className="space-y-2">
            <p className="text-sm font-medium">2. Paste it here</p>
            <Textarea
              rows={10}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={MODULE_JSON_EXAMPLE}
              className="font-mono text-xs"
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Step 3 */}
          {parsed && parsed.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium">
                3. Review — {parsed.length} module
                {parsed.length === 1 ? "" : "s"} ready to import
              </p>

              {duplicateCount > 0 && (
                <p className="text-xs text-amber-600">
                  {duplicateCount} slug
                  {duplicateCount === 1 ? "" : "s"} already exist on this course
                  and will be numbered to keep them unique.
                </p>
              )}

              <div className="divide-y rounded-md border">
                {parsed.map((module, index) => (
                  <div
                    key={`${module.slug}-${index}`}
                    className="flex items-start justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {module.title}
                      </p>
                      {module.subTitle && (
                        <p className="truncate text-xs text-muted-foreground">
                          {module.subTitle}
                        </p>
                      )}
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className="font-mono text-[10px]"
                        >
                          {module.slug}
                        </Badge>
                        {module.duplicate && (
                          <Badge
                            variant="outline"
                            className="border-amber-500 text-[10px] text-amber-600"
                          >
                            renamed
                          </Badge>
                        )}
                        {module.overview.moduleDuration && (
                          <span className="text-[11px] text-muted-foreground">
                            {module.overview.moduleDuration}
                          </span>
                        )}
                        {module.overview.moduleDescription.length > 0 && (
                          <span className="text-[11px] text-muted-foreground">
                            {module.overview.moduleDescription.length} overview
                            point
                            {module.overview.moduleDescription.length === 1
                              ? ""
                              : "s"}
                          </span>
                        )}
                      </div>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => handleDrop(index)}
                      disabled={importing}
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
          <Button variant="outline" onClick={close} disabled={importing}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!parsed?.length || importing}>
            {importing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Import {parsed?.length ?? 0} module
                {parsed?.length === 1 ? "" : "s"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
