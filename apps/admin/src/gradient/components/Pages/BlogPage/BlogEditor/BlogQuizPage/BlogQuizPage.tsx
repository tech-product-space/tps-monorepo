"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch, type Resolver } from "react-hook-form";
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
import { Button } from "@/gradient/components/ui/button";
import { Switch } from "@/gradient/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { blogService, type BlogQuiz } from "@/gradient/services/blogService";
import {
  useBlogEditorSection,
  type SectionSaveResult,
} from "../BlogEditorContext";
import {
  cleanQuiz,
  emptyQuizQuestion,
  initQuiz,
  OPTION_COUNT,
  parseQuizJson,
  QUIZ_AI_PROMPT,
  QUIZ_JSON_EXAMPLE,
  quizFormSchema,
  type QuizFormValues,
} from "./quizForm";

// ─── Helpers ──────────────────────────────────────────────────────────────────

type MaybeFieldError =
  | { message?: string; root?: { message?: string } }
  | undefined;

const messageOf = (error: unknown): string | undefined => {
  const node = error as MaybeFieldError;
  return node?.root?.message ?? node?.message;
};

// ─── Component ────────────────────────────────────────────────────────────────

interface BlogQuizPageProps {
  blogId?: string;
  quiz?: BlogQuiz;
  onCountChange?: (count: number) => void;
}

export const BlogQuizPage = ({
  blogId,
  quiz,
  onCountChange,
}: BlogQuizPageProps) => {
  const defaultValues = useMemo(() => initQuiz(quiz) as QuizFormValues, [quiz]);

  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors, isDirty },
  } = useForm<QuizFormValues>({
    resolver: zodResolver(quizFormSchema) as Resolver<QuizFormValues>,
    defaultValues,
  });

  const { fields, append, remove, move } = useFieldArray({
    control,
    name: "questions",
  });

  // Watched so the radios and the enable toggle re-render on change — neither
  // is a plain registered input.
  const enabled = useWatch({ control, name: "enabled" });
  const questions = useWatch({ control, name: "questions" });

  const [importOpen, setImportOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");

  // Array-level issues land on `.root` in newer react-hook-form and directly on
  // the node in older ones — read both so the message never goes missing.
  const quizLevelError = messageOf(errors.questions);

  useEffect(() => {
    onCountChange?.(fields.length);
  }, [fields.length, onCountChange]);

  const save = useCallback(async (): Promise<SectionSaveResult> => {
    let outcome: SectionSaveResult = "invalid";

    await handleSubmit(async (values) => {
      if (!blogId) throw new Error("Blog ID is missing");

      const cleaned = cleanQuiz(values);
      await blogService.updateBlog(blogId, { quiz: cleaned });

      // Re-baseline against what was actually sent so the form reports itself
      // clean again — cleanQuiz trims and may drop trailing empty options.
      reset(initQuiz(cleaned) as QuizFormValues);
      outcome = "saved";
    })();

    return outcome;
  }, [blogId, handleSubmit, reset]);

  useBlogEditorSection("quiz", isDirty, save);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(QUIZ_AI_PROMPT);
      toast.success("Prompt copied — paste it into an AI chat with your content");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const handleImport = () => {
    const parsed = parseQuizJson(jsonText);

    if (!parsed) {
      toast.error(
        'Invalid JSON. Expected an array like [{ "question": "...", "options": ["..."], "answerIndex": 0 }]',
      );
      return;
    }

    // Skip questions that already exist (also dedupes within the paste).
    const seen = new Set(
      (questions ?? []).map((q) => q.question.trim().toLowerCase()),
    );
    const fresh = parsed.filter((q) => {
      const key = q.question.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const skipped = parsed.length - fresh.length;

    if (fresh.length === 0) {
      toast.info("All pasted questions already exist — nothing imported");
      return;
    }

    append(fresh, { shouldFocus: false });
    toast.success(
      `Imported ${fresh.length} question${fresh.length > 1 ? "s" : ""}` +
        (skipped > 0
          ? `, skipped ${skipped} duplicate${skipped > 1 ? "s" : ""}`
          : ""),
    );
    setJsonText("");
    setImportOpen(false);
  };

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-6 w-full">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
              Active recall quiz
            </CardTitle>
            <p className="text-xs text-muted-foreground max-w-md">
              Optional. When enabled, a multiple-choice quiz renders below the
              blog content. Anyone can take it — no login required.
            </p>
          </div>

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

            <span className="text-sm text-muted-foreground">Enabled</span>

            <Switch
              checked={Boolean(enabled)}
              onCheckedChange={(val) =>
                setValue("enabled", val, {
                  shouldDirty: true,
                  shouldValidate: true,
                })
              }
            />
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {quizLevelError && (
            <p className="text-xs text-destructive">{quizLevelError}</p>
          )}

          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No questions yet. Add at least one question to use the quiz.
            </p>
          )}

          {fields.map((field, i) => {
            const questionErrors = errors.questions?.[i];

            return (
              <div
                key={field.id}
                className="border bg-white rounded-lg p-4 space-y-3"
              >
                {/* Header row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium text-muted-foreground">
                      Question #{i + 1}
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
                  <Textarea
                    placeholder="Enter the question"
                    rows={2}
                    className="resize-none"
                    {...register(`questions.${i}.question`)}
                  />
                  {questionErrors?.question && (
                    <p className="text-xs text-destructive">
                      {questionErrors.question.message}
                    </p>
                  )}
                </div>

                {/* Options */}
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Options — select the radio next to the correct answer. Leave
                    the last ones blank for a shorter question.
                  </p>

                  {Array.from({ length: OPTION_COUNT }, (_, oi) => (
                    <label key={oi} className="flex items-center gap-3">
                      <input
                        type="radio"
                        name={`answer-${field.id}`}
                        className="h-4 w-4 shrink-0 accent-primary cursor-pointer"
                        checked={questions?.[i]?.answerIndex === oi}
                        onChange={() =>
                          setValue(`questions.${i}.answerIndex`, oi, {
                            shouldDirty: true,
                            shouldValidate: true,
                          })
                        }
                      />
                      <Input
                        placeholder={`Option ${oi + 1}`}
                        {...register(`questions.${i}.options.${oi}`)}
                      />
                    </label>
                  ))}

                  {messageOf(questionErrors?.options) && (
                    <p className="text-xs text-destructive">
                      {messageOf(questionErrors?.options)}
                    </p>
                  )}
                  {questionErrors?.answerIndex && (
                    <p className="text-xs text-destructive">
                      {questionErrors.answerIndex.message}
                    </p>
                  )}
                </div>

                <input
                  type="hidden"
                  {...register(`questions.${i}.answerIndex`, {
                    valueAsNumber: true,
                  })}
                />
                <input type="hidden" {...register(`questions.${i}.id`)} />
              </div>
            );
          })}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => append(emptyQuizQuestion())}
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Question
          </Button>
        </CardContent>
      </Card>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Import quiz questions from JSON</DialogTitle>
            <DialogDescription>
              Paste an array of question objects. Imported questions are added
              below any existing ones.
            </DialogDescription>
          </DialogHeader>

          <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto text-muted-foreground whitespace-pre-wrap">
            {QUIZ_JSON_EXAMPLE}
          </pre>

          <Textarea
            placeholder="Paste quiz JSON here"
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
