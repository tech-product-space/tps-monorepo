"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useForm,
  useFieldArray,
  useWatch,
  type Resolver,
} from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ChevronDown,
  ChevronUp,
  Copy,
  FileJson,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import { Input } from "@/gradient/components/ui/input";
import { Textarea } from "@/gradient/components/ui/textarea";
import { Label } from "@/gradient/components/ui/label";
import { Button } from "@/gradient/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { blogService, type FaqItem } from "@/gradient/services/blogService";
import {
  useBlogEditorSection,
  type SectionSaveResult,
} from "../BlogEditorContext";
import {
  FAQ_AI_PROMPT,
  FAQ_JSON_EXAMPLE,
  faqFormSchema,
  parseFaqJson,
  type FaqFormValues,
} from "./faqForm";

// ─── Component ────────────────────────────────────────────────────────────────

interface BlogFaqPageProps {
  blogId?: string;
  faq?: FaqItem[];
  onCountChange?: (count: number) => void;
}

export const BlogFaqPage = ({
  blogId,
  faq,
  onCountChange,
}: BlogFaqPageProps) => {
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors, isDirty },
  } = useForm<FaqFormValues>({
    resolver: zodResolver(faqFormSchema) as Resolver<FaqFormValues>,
    defaultValues: {
      faq: Array.isArray(faq) ? [...faq].sort((a, b) => a.index - b.index) : [],
    },
  });

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "faq",
  });

  // Watched so the import dedupe sees what is currently typed, not the
  // values the form mounted with.
  const faqValues = useWatch({ control, name: "faq" });

  const [importOpen, setImportOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");

  useEffect(() => {
    onCountChange?.(fields.length);
  }, [fields.length, onCountChange]);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(FAQ_AI_PROMPT);
      toast.success("Prompt copied — paste it into an AI chat with your content");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const handleImport = () => {
    const parsed = parseFaqJson(jsonText);

    if (!parsed) {
      toast.error(
        'Invalid JSON. Expected an array like [{ "question": "...", "answer": "..." }]',
      );
      return;
    }

    // Skip questions that already exist (also dedupes within the paste).
    const seen = new Set(
      (faqValues ?? []).map((item) => item.question.trim().toLowerCase()),
    );
    const fresh = parsed.filter((item) => {
      const key = item.question.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const skipped = parsed.length - fresh.length;

    if (fresh.length === 0) {
      toast.info("All pasted questions already exist — nothing imported");
      return;
    }

    append(
      fresh.map((item, i) => ({ ...item, index: fields.length + i })),
      { shouldFocus: false },
    );
    toast.success(
      `Imported ${fresh.length} FAQ${fresh.length > 1 ? "s" : ""}` +
        (skipped > 0
          ? `, skipped ${skipped} duplicate${skipped > 1 ? "s" : ""}`
          : ""),
    );
    setJsonText("");
    setImportOpen(false);
  };

  const save = useCallback(async (): Promise<SectionSaveResult> => {
    let outcome: SectionSaveResult = "invalid";

    await handleSubmit(async (values) => {
      if (!blogId) throw new Error("Blog ID is missing");

      const reindexed = values.faq.map((item, i) => ({ ...item, index: i }));
      await blogService.updateBlog(blogId, { faq: reindexed });

      // Re-baseline so the form reports itself clean again.
      reset({ faq: reindexed });
      outcome = "saved";
    })();

    return outcome;
  }, [blogId, handleSubmit, reset]);

  useBlogEditorSection("faq", isDirty, save);

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="space-y-6 w-full"
    >
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
            FAQ
          </CardTitle>

          <div className="flex items-center gap-2 shrink-0">
            <Button type="button" variant="outline" size="sm" onClick={copyPrompt}>
              <Copy className="h-4 w-4 mr-1" />
              Copy Prompt
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setImportOpen(true)}
            >
              <FileJson className="h-4 w-4 mr-1" />
              Import JSON
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({ index: fields.length, question: "", answer: "" })
              }
            >
              <Plus className="h-4 w-4 mr-1" />
              Add FAQ
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No FAQs yet. Click &quot;Add FAQ&quot; to get started.
            </p>
          )}

          {fields.map((field, i) => (
            <div
              key={field.id}
              className="border bg-white rounded-lg p-4 space-y-3"
            >
              {/* Header row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-muted-foreground">
                    FAQ #{i + 1}
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={i === fields.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => remove(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Question */}
              <div className="space-y-1.5">
                <Label>
                  Question <span className="text-destructive">*</span>
                </Label>
                <Input
                  placeholder="Enter the question"
                  {...register(`faq.${i}.question`)}
                />
                {errors.faq?.[i]?.question && (
                  <p className="text-xs text-destructive">
                    {errors.faq[i].question?.message}
                  </p>
                )}
              </div>

              {/* Answer */}
              <div className="space-y-1.5">
                <Label>
                  Answer <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  placeholder="Enter the answer"
                  rows={3}
                  className="resize-none"
                  {...register(`faq.${i}.answer`)}
                />
                {errors.faq?.[i]?.answer && (
                  <p className="text-xs text-destructive">
                    {errors.faq[i].answer?.message}
                  </p>
                )}
              </div>

              <input
                type="hidden"
                {...register(`faq.${i}.index`, { valueAsNumber: true })}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Import FAQs from JSON</DialogTitle>
            <DialogDescription>
              Paste an array of question/answer objects. Imported FAQs are added
              below any existing ones.
            </DialogDescription>
          </DialogHeader>

          <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto text-muted-foreground whitespace-pre-wrap">
            {FAQ_JSON_EXAMPLE}
          </pre>

          <Textarea
            placeholder="Paste FAQ JSON here"
            rows={8}
            className="font-mono text-sm resize-none"
            value={jsonText}
            onChange={(e) => setJsonText(e.target.value)}
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportOpen(false)}
            >
              Cancel
            </Button>

            <Button
              type="button"
              onClick={handleImport}
              disabled={!jsonText.trim()}
            >
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
};
