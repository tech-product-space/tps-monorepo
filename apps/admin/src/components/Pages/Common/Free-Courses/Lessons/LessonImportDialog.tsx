"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  Copy,
  Loader2,
  Trash2,
  AlertTriangle,
  Info,
  FileText,
  Upload,
  Download,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { LESSON_CONTENT_VERSION, type ICourseLesson } from "@/types/course";
import {
  importLessons,
  type IImportLessonPayload,
} from "@/services/courses/lessons";
import {
  parseTiptapLessonsJson,
  type ParsedTiptapLesson,
} from "../import/parseTiptapLessonsJson";
import { assignSlugs } from "../import/assignSlugs";
import {
  LESSON_AI_PROMPT,
  LESSON_JSON_EXAMPLE,
} from "../import/lessonImportPrompt";
import {
  docxToTiptapLessons,
  type SplitLevel,
} from "../import/docxToTiptapLessons";
import { downloadImportGuide } from "../import/importGuide";
import dynamic from "next/dynamic";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Read-only, but still a full ProseMirror instance — keep it out of the page's
// initial bundle; the dialog is rarely opened.
const TiptapDocPreview = dynamic(
  () =>
    import("@/components/TiptapEditor/TiptapDocPreview").then(
      (m) => m.TiptapDocPreview,
    ),
  { ssr: false },
);

/** Top-level nodes in a document — the preview's "how much is in here" number. */
const nodeCount = (doc: Record<string, unknown>): number => {
  const content = doc?.content;
  return Array.isArray(content) ? content.length : 0;
};

interface LessonImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  moduleId: string;
  courseId: string;
  existingLessons: ICourseLesson[];
  onImported: () => void | Promise<void>;
}

export function LessonImportDialog({
  open,
  onOpenChange,
  moduleId,
  courseId,
  existingLessons,
  onImported,
}: LessonImportDialogProps) {
  const [jsonText, setJsonText] = useState("");
  const [parsed, setParsed] = useState<ParsedTiptapLesson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  // Google Doc (.docx) mode
  const [splitOn, setSplitOn] = useState<SplitLevel>("h1");
  const [reading, setReading] = useState(false);
  // Count only — mammoth doesn't reveal how many images a document holds until
  // it has finished converting, so there is no honest total to show.
  const [uploadedCount, setUploadedCount] = useState(0);
  const [docWarnings, setDocWarnings] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingSlugs = useMemo(
    () => new Set(existingLessons.map((l) => l.slug)),
    [existingLessons],
  );

  const reset = () => {
    setJsonText("");
    setParsed(null);
    setError(null);
    setDocWarnings([]);
    setUploadedCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(LESSON_AI_PROMPT);
      toast.success(
        "Prompt copied — paste it into an AI chat with your lesson material",
      );
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const handleParse = () => {
    const result = parseTiptapLessonsJson(jsonText, existingSlugs);
    if (result.error) {
      setParsed(null);
      setError(result.error);
      return;
    }
    setError(null);
    setParsed(result.lessons);
  };

  const handleDocxFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setError(
        "That isn't a .docx file. In Google Docs use File → Download → Microsoft Word (.docx).",
      );
      return;
    }
    if (!courseId) {
      setError("Course id is missing, so images can't be uploaded.");
      return;
    }

    setError(null);
    setReading(true);
    setUploadedCount(0);
    try {
      const { lessons, warnings } = await docxToTiptapLessons(file, {
        courseId,
        splitOn,
        onProgress: (n) => setUploadedCount(n),
      });

      if (lessons.length === 0) {
        setError(
          warnings[0] ?? "Nothing could be read from that document.",
        );
        return;
      }

      // Reuse the JSON path's shape so preview/import/dedupe stay identical.
      const asParsed: ParsedTiptapLesson[] = lessons.map((l) => ({
        title: l.title,
        slugBase: l.title,
        slug: "",
        duplicate: false,
        content: { doc: l.doc },
        // Per-lesson notes come from the shared docx pipeline, which reports
        // against the whole document rather than a single section.
        warnings: [],
      }));

      setDocWarnings(warnings);
      setParsed(assignSlugs(asParsed, existingSlugs));
    } catch (err: any) {
      console.error("docx import failed", err);
      setError(
        err?.message
          ? `Couldn't read that document: ${err.message}`
          : "Couldn't read that document.",
      );
    } finally {
      setReading(false);
    }
  };

  const handleImport = async () => {
    if (!parsed || parsed.length === 0) return;

    const payload: IImportLessonPayload[] = parsed.map((l) => ({
      title: l.title,
      slug: l.slug,
      content: l.content,
      content_version: LESSON_CONTENT_VERSION.TIPTAP,
    }));

    try {
      setImporting(true);
      const res = await importLessons(moduleId, payload);
      toast.success(
        `Imported ${res.created} lesson${res.created > 1 ? "s" : ""} as drafts`,
      );
      close();
      await onImported();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to import lessons");
    } finally {
      setImporting(false);
    }
  };

  const duplicateCount = parsed?.filter((l) => l.duplicate).length ?? 0;
  const allWarnings = [
    ...docWarnings,
    ...(parsed?.flatMap((l) => l.warnings) ?? []),
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
    >
      <DialogContent className="w-full max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Lessons</DialogTitle>
          <DialogDescription>
            Bring lessons in from a Google Doc, or from JSON an AI wrote for you.
            Either way you get a preview first, and imported lessons are added to
            the end of this module, always as drafts.
          </DialogDescription>
        </DialogHeader>

        {parsed === null ? (
          <Tabs defaultValue="doc" className="py-2">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="doc">
                <FileText className="h-4 w-4 mr-1.5" />
                Google Doc
              </TabsTrigger>
              <TabsTrigger value="json">
                <Copy className="h-4 w-4 mr-1.5" />
                Paste JSON
              </TabsTrigger>
            </TabsList>

            {/* ---------- Google Doc (.docx) ---------- */}
            <TabsContent value="doc" className="space-y-4 pt-4">
              <div className="rounded-md border bg-muted/40 p-3 text-sm text-gray-600">
                <div className="flex items-start justify-between gap-3">
                  <p>
                    In Google Docs choose{" "}
                    <span className="font-medium text-gray-900">
                      File → Download → Microsoft Word (.docx)
                    </span>
                    , then drop the file here. Images come across and are
                    uploaded for you — a copied markdown version can&apos;t carry
                    them.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5"
                    onClick={downloadImportGuide}
                  >
                    <Download className="h-4 w-4" />
                    Guide
                  </Button>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  New to this? Download the formatting guide for how headings
                  become lessons and how to add code blocks.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Label className="text-[13px] font-semibold uppercase tracking-wider text-gray-500">
                  Start a new lesson at
                </Label>
                <Select
                  value={splitOn}
                  onValueChange={(v) => setSplitOn(v as SplitLevel)}
                >
                  <SelectTrigger className="h-8 w-[190px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="h1">Every Heading 1</SelectItem>
                    <SelectItem value="h2">Every Heading 2</SelectItem>
                    <SelectItem value="none">
                      Don&apos;t split — one lesson
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <label
                htmlFor="docx-input"
                className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-10 cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition-colors"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) handleDocxFile(f);
                }}
              >
                {reading ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
                    <span className="text-sm text-gray-600">
                      {uploadedCount > 0
                        ? `Reading document… ${uploadedCount} image${uploadedCount > 1 ? "s" : ""} uploaded`
                        : "Reading document…"}
                    </span>
                  </>
                ) : (
                  <>
                    <Upload className="h-6 w-6 text-gray-400" />
                    <span className="text-sm text-gray-600">
                      Drop a .docx here, or click to choose
                    </span>
                  </>
                )}
              </label>
              <input
                id="docx-input"
                ref={fileInputRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                disabled={reading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleDocxFile(f);
                }}
              />

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </TabsContent>

            {/* ---------- Paste JSON ---------- */}
            <TabsContent value="json" className="space-y-4 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold uppercase tracking-wider text-gray-500">
                  Paste lesson JSON
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleCopyPrompt}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copy Prompt
                </Button>
              </div>

              <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto text-muted-foreground">
                {LESSON_JSON_EXAMPLE}
              </pre>

              <Textarea
                placeholder="Paste lesson JSON here"
                rows={10}
                className="font-mono text-sm resize-none"
                value={jsonText}
                onChange={(e) => {
                  setJsonText(e.target.value);
                  if (error) setError(null);
                }}
              />

              {error && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex justify-end">
                <Button
                  type="button"
                  onClick={handleParse}
                  disabled={!jsonText.trim()}
                  className="bg-blue-800 hover:bg-blue-900 disabled:opacity-70"
                >
                  Preview
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">
                  {parsed.length} lesson{parsed.length > 1 ? "s" : ""}
                </span>{" "}
                ready to import. Expand one to see how its content will render.
              </p>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setParsed(null)}
              >
                Back to paste
              </Button>
            </div>

            {duplicateCount > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  {duplicateCount} lesson{duplicateCount > 1 ? "s" : ""} reuse an
                  existing slug and will be saved with a numbered suffix. Remove
                  them below if they are duplicates.
                </span>
              </div>
            )}

            {allWarnings.length > 0 && (
              <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                <div className="flex items-center gap-2 font-medium mb-1">
                  <Info className="h-4 w-4 shrink-0" />
                  Some content couldn&apos;t be imported
                </div>
                <ul className="list-disc pl-6 space-y-0.5">
                  {Array.from(new Set(allWarnings)).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            {parsed.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed rounded-lg bg-gray-50/50">
                <p className="text-sm text-gray-400">
                  You removed every lesson. Go back to paste again.
                </p>
              </div>
            ) : (
              <Accordion type="multiple" className="space-y-2">
                {parsed.map((l, idx) => {
                  const count = nodeCount(l.content.doc);
                  return (
                    <AccordionItem
                      key={`${l.slug}-${idx}`}
                      value={`${l.slug}-${idx}`}
                      className="border rounded-lg px-4"
                    >
                      <div className="flex items-center gap-2">
                        <AccordionTrigger className="flex-1 hover:no-underline">
                          <div className="flex flex-col items-start text-left gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">
                                {l.title}
                              </span>
                              {l.duplicate && (
                                <Badge
                                  variant="secondary"
                                  className="bg-amber-100 text-amber-800 text-[10px] uppercase"
                                >
                                  Slug taken
                                </Badge>
                              )}
                              {l.warnings.length > 0 && (
                                <Badge
                                  variant="secondary"
                                  className="bg-blue-100 text-blue-800 text-[10px] uppercase"
                                >
                                  {l.warnings.length} note
                                  {l.warnings.length > 1 ? "s" : ""}
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-gray-400 font-mono">
                              /{l.slug}
                            </span>
                          </div>
                        </AccordionTrigger>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {count} block{count === 1 ? "" : "s"}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-gray-300 hover:text-red-500"
                          onClick={() =>
                            setParsed(
                              // Re-slug the survivors so a dropped lesson frees
                              // the slug it was holding.
                              assignSlugs(
                                parsed.filter((_, i) => i !== idx),
                                existingSlugs,
                              ),
                            )
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <AccordionContent className="pb-4">
                        {l.warnings.length > 0 && (
                          <ul className="list-disc pl-5 mb-3 text-xs text-blue-700 space-y-0.5">
                            {l.warnings.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        )}
                        {count === 0 ? (
                          <p className="text-sm text-gray-400 italic">
                            No content — you can write it in the editor later.
                          </p>
                        ) : (
                          // Parsed against the editor's own schema, so this
                          // preview is what the lesson will actually contain.
                          // The dark surface the lesson player uses, so the
                          // preview is what a learner will see.
                          <div className="module-lesson-preview rounded-md border overflow-x-auto">
                            <TiptapDocPreview doc={l.content.doc} />
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </div>
        )}

        <DialogFooter className="sticky bottom-0 bg-white pt-4 border-t z-10">
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          {parsed !== null && (
            <Button
              type="button"
              onClick={handleImport}
              disabled={importing || parsed.length === 0}
              className="bg-blue-800 hover:bg-blue-900 disabled:opacity-70"
            >
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import {parsed.length > 0 ? parsed.length : ""} Lesson
              {parsed.length === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
