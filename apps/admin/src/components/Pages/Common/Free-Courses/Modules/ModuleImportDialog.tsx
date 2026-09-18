"use client";

import React, { useMemo, useState } from "react";
import { Copy, Loader2, Trash2, AlertTriangle } from "lucide-react";
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
import type { CourseModule, ImportModulePayload } from "@/types/course";
import { importModules } from "@/services/courses/modules";
import {
  parseModulesJson,
  assignSlugs,
  type ParsedModule,
} from "../import/parseModulesJson";
import {
  MODULE_AI_PROMPT,
  MODULE_JSON_EXAMPLE,
} from "../import/moduleImportPrompt";

interface ModuleImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  existingModules: CourseModule[];
  onImported: () => void | Promise<void>;
}

export function ModuleImportDialog({
  open,
  onOpenChange,
  courseId,
  existingModules,
  onImported,
}: ModuleImportDialogProps) {
  const [jsonText, setJsonText] = useState("");
  const [parsed, setParsed] = useState<ParsedModule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const existingSlugs = useMemo(
    () => new Set(existingModules.map((m) => m.slug)),
    [existingModules],
  );

  const reset = () => {
    setJsonText("");
    setParsed(null);
    setError(null);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(MODULE_AI_PROMPT);
      toast.success(
        "Prompt copied — paste it into an AI chat with your course outline",
      );
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const handleParse = () => {
    const result = parseModulesJson(jsonText, existingSlugs);
    if (result.error) {
      setParsed(null);
      setError(result.error);
      return;
    }
    setError(null);
    setParsed(result.modules);
  };

  const handleImport = async () => {
    if (!parsed || parsed.length === 0) return;

    const payload: ImportModulePayload[] = parsed.map((m) => ({
      title: m.title,
      slug: m.slug,
      subtitle: m.subtitle || undefined,
      overview: m.overview,
    }));

    try {
      setImporting(true);
      const res = await importModules(courseId, payload);
      toast.success(
        `Imported ${res.created} module${res.created > 1 ? "s" : ""} as drafts`,
      );
      close();
      await onImported();
    } catch (err: any) {
      const message =
        err?.response?.data?.message || "Failed to import modules";
      toast.error(message);
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
      <DialogContent className="w-full max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Modules</DialogTitle>
          <DialogDescription>
            Copy the prompt into an AI chat with your course outline, then paste
            the JSON it returns. Imported modules are added below any existing
            ones, always as drafts.
          </DialogDescription>
        </DialogHeader>

        {parsed === null ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold uppercase tracking-wider text-gray-500">
                Paste module JSON
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
              {MODULE_JSON_EXAMPLE}
            </pre>

            <Textarea
              placeholder="Paste module JSON here"
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
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">
                  {parsed.length} module{parsed.length > 1 ? "s" : ""}
                </span>{" "}
                ready to import. Review, drop any you don&apos;t want, then
                import.
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
                  {duplicateCount} module{duplicateCount > 1 ? "s" : ""} reuse an
                  existing slug and will be saved with a numbered suffix. Remove
                  them below if they are duplicates.
                </span>
              </div>
            )}

            {parsed.length === 0 ? (
              <div className="text-center py-10 border-2 border-dashed rounded-lg bg-gray-50/50">
                <p className="text-sm text-gray-400">
                  You removed every module. Go back to paste again.
                </p>
              </div>
            ) : (
              <Accordion type="multiple" className="space-y-2">
                {parsed.map((m, idx) => {
                  const elements = m.overview.sections.reduce(
                    (n, s) => n + s.elements.length,
                    0,
                  );
                  return (
                    <AccordionItem
                      key={`${m.slug}-${idx}`}
                      value={`${m.slug}-${idx}`}
                      className="border rounded-lg px-4"
                    >
                      <div className="flex items-center gap-2">
                        <AccordionTrigger className="flex-1 hover:no-underline">
                          <div className="flex flex-col items-start text-left gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">
                                {m.title}
                              </span>
                              {m.duplicate && (
                                <Badge
                                  variant="secondary"
                                  className="bg-amber-100 text-amber-800 text-[10px] uppercase"
                                >
                                  Slug taken
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-gray-400 font-mono">
                              /{m.slug}
                            </span>
                          </div>
                        </AccordionTrigger>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {m.overview.sections.length} section
                          {m.overview.sections.length === 1 ? "" : "s"} ·{" "}
                          {elements} block{elements === 1 ? "" : "s"}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-gray-300 hover:text-red-500"
                          onClick={() =>
                            setParsed(
                              // Re-slug the survivors so a dropped module frees
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
                        {m.subtitle && (
                          <p className="text-sm text-gray-500 mb-3">
                            {m.subtitle}
                          </p>
                        )}
                        {m.overview.sections.length === 0 ? (
                          <p className="text-sm text-gray-400 italic">
                            No overview content — you can add it later.
                          </p>
                        ) : (
                          <div className="space-y-4">
                            {m.overview.sections.map((s) => (
                              <div
                                key={s.id}
                                className="border-l-2 border-blue-100 pl-3"
                              >
                                {s.heading && (
                                  <p className="text-sm font-semibold text-gray-800">
                                    {s.heading}
                                  </p>
                                )}
                                {s.subheading && (
                                  <p className="text-xs text-gray-500 mb-1">
                                    {s.subheading}
                                  </p>
                                )}
                                <div className="space-y-2 mt-1">
                                  {s.elements.map((el) => (
                                    <div key={el.id} className="text-sm">
                                      {el.type === "paragraph" && (
                                        <p className="text-gray-600 line-clamp-3">
                                          {el.content}
                                        </p>
                                      )}
                                      {el.type === "bullets" && (
                                        <ul className="list-disc pl-5 text-gray-600">
                                          {el.listItems?.map((li, i) => (
                                            <li key={i}>{li}</li>
                                          ))}
                                        </ul>
                                      )}
                                      {el.type === "nested-bullets" && (
                                        <ul className="list-disc pl-5 text-gray-600">
                                          {el.nestedItems?.map((ni, i) => (
                                            <li key={i}>
                                              {ni.text}
                                              {ni.subItems.length > 0 && (
                                                <ul className="list-[circle] pl-5">
                                                  {ni.subItems.map((si, j) => (
                                                    <li key={j}>{si}</li>
                                                  ))}
                                                </ul>
                                              )}
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ))}
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
          {parsed === null ? (
            <Button
              type="button"
              onClick={handleParse}
              disabled={!jsonText.trim()}
              className="bg-blue-800 hover:bg-blue-900 disabled:opacity-70"
            >
              Preview
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleImport}
              disabled={importing || parsed.length === 0}
              className="bg-blue-800 hover:bg-blue-900 disabled:opacity-70"
            >
              {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Import {parsed.length > 0 ? parsed.length : ""} Module
              {parsed.length === 1 ? "" : "s"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
