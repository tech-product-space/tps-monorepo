"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MoveDown, MoveUp, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/gradient/components/ui/badge";
import { Button } from "@/gradient/components/ui/button";
import { Card, CardContent } from "@/gradient/components/ui/card";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { Textarea } from "@/gradient/components/ui/textarea";
import { freeCourseService } from "@/gradient/services/freeCourseService";
import { FAQ } from "@/gradient/types/freeCourse";

import FaqImportDialog from "./FaqImportDialog";
import { normalizeQuestion } from "../import/parseFaqJson";

interface FreeCourseFaqPageProps {
  courseId: string;
  faq: FAQ[];
  onSaved: (faq: FAQ[]) => void;
  onRegister?: (api: { save: () => Promise<boolean> }) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/** Compares content only — `index` is derived from position on save. */
const asKey = (faq: FAQ[]) =>
  JSON.stringify(faq.map((f) => [f.question, f.answer]));

/**
 * Positions of questions that repeat an earlier one, matched on wording rather
 * than punctuation. The first occurrence is left alone; the repeats are the
 * ones the admin has to resolve.
 */
const findDuplicates = (faq: { question: string }[]): Set<number> => {
  const seen = new Set<string>();
  const repeats = new Set<number>();

  faq.forEach((item, index) => {
    const normalized = normalizeQuestion(item.question);
    if (!normalized) return;
    if (seen.has(normalized)) repeats.add(index);
    seen.add(normalized);
  });

  return repeats;
};

export default function FreeCourseFaqPage({
  courseId,
  faq: savedFaq,
  onSaved,
  onRegister,
  onDirtyChange,
}: FreeCourseFaqPageProps) {
  const [items, setItems] = useState<FAQ[]>(savedFaq);
  const [importOpen, setImportOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const savedKey = asKey(savedFaq);

  // A save elsewhere (or a reload) makes the server copy the new baseline.
  useEffect(() => {
    setItems(savedFaq);
  }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const isDirty = asKey(items) !== savedKey;

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const duplicates = useMemo(() => findDuplicates(items), [items]);

  const save = useCallback(async (): Promise<boolean> => {
    const cleaned = items
      .map((item) => ({
        question: item.question.trim(),
        answer: item.answer.trim(),
      }))
      .filter((item) => item.question || item.answer);

    const blank = cleaned.findIndex((item) => !item.question || !item.answer);
    if (blank !== -1) {
      toast.error(`FAQ ${blank + 1} needs both a question and an answer.`);
      return false;
    }

    // The public page renders one accordion row per question, so two identical
    // ones are always a mistake — refuse rather than publish the duplicate.
    const repeats = findDuplicates(cleaned);
    if (repeats.size > 0) {
      const first = Math.min(...repeats);
      toast.error(
        `FAQ ${first + 1} repeats a question above it. Every question must be unique.`,
      );
      return false;
    }

    // `index` is what the public page orders by, so it is rewritten from the
    // list order rather than carried over from whatever came back last time.
    const payload = cleaned.map((item, index) => ({ ...item, index }));

    setSaving(true);
    try {
      const res = await freeCourseService.updateFreeCourse(courseId, {
        faq: payload,
      });

      if (!res.success) {
        toast.error(res.message || "Failed to save FAQs");
        return false;
      }

      toast.success("FAQs saved");
      onSaved(payload);
      return true;
    } catch (error: any) {
      console.error(error);
      toast.error(error.response?.data?.message || "Failed to save FAQs");
      return false;
    } finally {
      setSaving(false);
    }
  }, [courseId, items, onSaved]);

  useEffect(() => {
    onRegister?.({ save });
  }, [onRegister, save]);

  const addFaq = () => {
    setItems((prev) => [
      ...prev,
      { question: "", answer: "", index: prev.length },
    ]);
  };

  const updateFaq = (index: number, patch: Partial<FAQ>) => {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  };

  const removeFaq = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const move = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= items.length) return;

    setItems((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleImport = (imported: { question: string; answer: string }[]) => {
    setItems((prev) => [
      ...prev,
      ...imported.map((item, i) => ({ ...item, index: prev.length + i })),
    ]);
  };

  const existingQuestions = useMemo(
    () => items.map((item) => item.question),
    [items],
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">FAQs ({items.length})</h2>
          <p className="text-sm text-muted-foreground">
            Shown at the bottom of the course page, in this order.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-2 h-4 w-4" />
            Import FAQs
          </Button>
          <Button onClick={addFaq}>
            <Plus className="mr-2 h-4 w-4" />
            Add FAQ
          </Button>
        </div>
      </div>

      {duplicates.size > 0 && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {duplicates.size} question{duplicates.size === 1 ? "" : "s"} repeat
          {duplicates.size === 1 ? "s" : ""} one above. Every question must be
          unique before this can be saved.
        </p>
      )}

      {items.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <p className="text-muted-foreground">
              No FAQs on this course yet. Add them one at a time, or import a
              batch from your notes.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {items.map((item, index) => {
            const isDuplicate = duplicates.has(index);
            return (
              <Card
                key={index}
                className={isDuplicate ? "ring-1 ring-destructive" : ""}
              >
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        FAQ #{index + 1}
                      </span>
                      {isDuplicate && (
                        <Badge variant="destructive" className="text-[10px]">
                          Duplicate question
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Move up"
                        disabled={index === 0}
                        onClick={() => move(index, "up")}
                      >
                        <MoveUp className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        title="Move down"
                        disabled={index === items.length - 1}
                        onClick={() => move(index, "down")}
                      >
                        <MoveDown className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        title="Delete FAQ"
                        onClick={() => removeFaq(index)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label>Question</Label>
                    <Input
                      value={item.question}
                      placeholder="Enter the question"
                      onChange={(e) =>
                        updateFaq(index, { question: e.target.value })
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Answer</Label>
                    <Textarea
                      value={item.answer}
                      placeholder="Enter the answer"
                      rows={3}
                      onChange={(e) =>
                        updateFaq(index, { answer: e.target.value })
                      }
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {items.length > 0 && (
        <div className="flex justify-end">
          <Button
            onClick={() => void save()}
            disabled={!isDirty || saving || duplicates.size > 0}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save FAQs"
            )}
          </Button>
        </div>
      )}

      <FaqImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        existingQuestions={existingQuestions}
        onImport={handleImport}
      />
    </div>
  );
}
