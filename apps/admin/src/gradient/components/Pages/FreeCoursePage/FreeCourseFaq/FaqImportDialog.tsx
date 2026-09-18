"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Copy, Trash2, Upload } from "lucide-react";
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
import {
  normalizeQuestion,
  parseFaqJson,
  type ParsedFaq,
} from "../import/parseFaqJson";
import { FAQ_AI_PROMPT, FAQ_JSON_EXAMPLE } from "../import/faqImportPrompt";

interface FaqImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Questions already on the course, so the preview can flag repeats. */
  existingQuestions: string[];
  /** Appends the imported rows to the working list — saving stays the tab's job. */
  onImport: (faqs: { question: string; answer: string }[]) => void;
}

export default function FaqImportDialog({
  open,
  onOpenChange,
  existingQuestions,
  onImport,
}: FaqImportDialogProps) {
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState<ParsedFaq[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The parent rebuilds its FAQ array on every render, so memoising on the
  // array identity would re-run the parse effect and restore dropped rows.
  // Key on the contents, which only change when a question is actually edited.
  const existingKey = existingQuestions
    .map(normalizeQuestion)
    .filter(Boolean)
    .sort()
    .join("|");

  const existing = useMemo(
    () => new Set(existingKey ? existingKey.split("|") : []),
    [existingKey],
  );

  const reset = () => {
    setRaw("");
    setParsed(null);
    setError(null);
  };

  const close = () => {
    reset();
    onOpenChange(false);
  };

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(FAQ_AI_PROMPT);
      toast.success("Prompt copied. Paste it into an AI chat with your notes.");
    } catch {
      toast.error("Could not copy. Select the prompt and copy it manually.");
    }
  };

  // Parse as soon as something is pasted. Debounced so a hand-typed edit does
  // not flash an error on every keystroke while the JSON is still incomplete.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!raw.trim()) {
        setParsed(null);
        setError(null);
        return;
      }

      const result = parseFaqJson(raw, existing);
      setError(result.error);
      setParsed(result.error ? null : result.faqs);
    }, 250);

    return () => clearTimeout(timer);
  }, [raw, existing]);

  // Dropping a row can free a question the ones below were duplicating.
  const handleDrop = (index: number) => {
    if (!parsed) return;

    const remaining = parsed.filter((_, i) => i !== index);
    if (remaining.length === 0) {
      setParsed(null);
      return;
    }

    const result = parseFaqJson(
      JSON.stringify(
        remaining.map((f) => ({ question: f.question, answer: f.answer })),
      ),
      existing,
    );
    setParsed(result.faqs);
  };

  const fresh = parsed?.filter((f) => !f.duplicate) ?? [];
  const duplicateCount = (parsed?.length ?? 0) - fresh.length;

  const handleImport = () => {
    if (!fresh.length) return;

    onImport(fresh.map((f) => ({ question: f.question, answer: f.answer })));
    toast.success(
      `${fresh.length} FAQ${fresh.length === 1 ? "" : "s"} added. Save to publish the change.`,
    );
    close();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import FAQs</DialogTitle>
          <DialogDescription>
            Turn a pile of questions into FAQ entries in one step. Imported rows
            are added to the list below — nothing is saved until you hit Save.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1 */}
          <div className="rounded-md border p-4">
            <p className="text-sm font-medium">1. Get the JSON</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Copy the prompt, paste it into any AI chat followed by your raw
              questions, then copy the JSON it returns.
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
              placeholder={FAQ_JSON_EXAMPLE}
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
                3. Review — {fresh.length} FAQ
                {fresh.length === 1 ? "" : "s"} ready to import
              </p>

              {duplicateCount > 0 && (
                <p className="text-xs text-amber-600">
                  {duplicateCount} question
                  {duplicateCount === 1 ? " is" : "s are"} already on this
                  course and will be skipped.
                </p>
              )}

              <div className="divide-y rounded-md border">
                {parsed.map((faq, index) => (
                  <div
                    key={`${faq.question}-${index}`}
                    className={`flex items-start justify-between gap-3 p-3 ${
                      faq.duplicate ? "opacity-60" : ""
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{faq.question}</p>
                        {faq.duplicate && (
                          <Badge
                            variant="outline"
                            className="border-amber-500 text-[10px] text-amber-600"
                          >
                            skipped — already added
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {faq.answer}
                      </p>
                    </div>

                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => handleDrop(index)}
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
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button onClick={handleImport} disabled={!fresh.length}>
            <Upload className="mr-2 h-4 w-4" />
            Add {fresh.length} FAQ{fresh.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
