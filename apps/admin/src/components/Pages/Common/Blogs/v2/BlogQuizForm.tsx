"use client";

import { useState } from "react";
import { Copy, FileJson, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  emptyQuizQuestion,
  type BlogQuiz,
  type QuizQuestion,
} from "./blogV2Form";

interface BlogQuizFormProps {
  value: BlogQuiz;
  onChange: (value: BlogQuiz) => void;
}

const QUIZ_AI_PROMPT = `You are a JSON formatter for a blog quiz importer. Convert the content I give you into multiple-choice quiz questions in this exact JSON format:

[
  {
    "question": "...",
    "options": ["option 1", "option 2", "option 3", "option 4"],
    "answerIndex": 0
  }
]

Rules:
- Output ONLY the raw JSON array — no markdown code fences, no explanation, no text before or after.
- Every item must have exactly three keys: "question" (non-empty string), "options" (array of 2 to 4 non-empty strings), and "answerIndex" (0-based number pointing to the correct option).
- Prefer exactly 4 options per question, with one clearly correct answer and plausible distractors.
- Plain text only — no HTML, no markdown, no line breaks inside strings.
- Escape quotes properly so the JSON is valid and parseable.
- Base questions only on the content I provide — do not invent facts. Aim for 5–8 questions covering its key points.

Here is the content:
`;

const QUIZ_JSON_EXAMPLE = `[
  {
    "question": "What does MVP stand for?",
    "options": ["Most Valuable Product", "Minimum Viable Product", "Maximum Value Proposition", "Minimum Valuable Plan"],
    "answerIndex": 1
  }
]`;

// Accepts a JSON array of {question, options[], answerIndex} (or "answer" as
// the correct option's text), or an object wrapping it as { questions: [...] }.
// Returns null if anything is malformed.
function parseQuizJson(raw: string): QuizQuestion[] | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    data = (data as { questions?: unknown }).questions;
  }
  if (!Array.isArray(data)) return null;

  const questions: QuizQuestion[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") return null;
    const obj = item as Record<string, unknown>;

    const question = typeof obj.question === "string" ? obj.question.trim() : "";
    if (!question) return null;

    if (!Array.isArray(obj.options)) return null;
    const options = obj.options.map((o) => (typeof o === "string" ? o.trim() : ""));
    if (options.length < 2 || options.length > 4 || options.some((o) => !o))
      return null;

    let answerIndex = -1;
    if (typeof obj.answerIndex === "number") {
      answerIndex = obj.answerIndex;
    } else if (typeof obj.answer === "string") {
      answerIndex = options.findIndex(
        (o) => o.toLowerCase() === (obj.answer as string).trim().toLowerCase(),
      );
    }
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length)
      return null;

    questions.push({ ...emptyQuizQuestion(), question, options, answerIndex });
  }
  return questions.length > 0 ? questions : null;
}

export default function BlogQuizForm({ value, onChange }: BlogQuizFormProps) {
  const [importOpen, setImportOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");

  const updateQuestion = (i: number, patch: Partial<QuizQuestion>) =>
    onChange({
      ...value,
      questions: value.questions.map((q, idx) =>
        idx === i ? { ...q, ...patch } : q,
      ),
    });

  const handleImport = () => {
    const parsed = parseQuizJson(jsonText);
    if (!parsed) {
      toast.error(
        'Invalid JSON. Expected an array like [{ "question": "...", "options": ["..."], "answerIndex": 0 }]',
      );
      return;
    }

    // Skip questions that already exist (also dedupes within the paste)
    const seen = new Set(
      value.questions.map((q) => q.question.trim().toLowerCase()),
    );
    const fresh: QuizQuestion[] = [];
    for (const q of parsed) {
      const key = q.question.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      fresh.push(q);
    }
    const skipped = parsed.length - fresh.length;

    if (fresh.length === 0) {
      toast.info("All pasted questions already exist — nothing imported");
      return;
    }
    onChange({ ...value, questions: [...value.questions, ...fresh] });
    toast.success(
      `Imported ${fresh.length} question${fresh.length > 1 ? "s" : ""}` +
        (skipped > 0 ? `, skipped ${skipped} duplicate${skipped > 1 ? "s" : ""}` : ""),
    );
    setJsonText("");
    setImportOpen(false);
  };

  const updateOption = (qi: number, oi: number, val: string) =>
    updateQuestion(qi, {
      options: value.questions[qi].options.map((o, idx) =>
        idx === oi ? val : o,
      ),
    });

  return (
    <div className="space-y-6 w-full max-w-4xl mx-auto px-5 py-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
              Active recall quiz
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Optional. When enabled, a multiple-choice quiz renders below the
              blog content. Anyone can take it — no login required.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(QUIZ_AI_PROMPT);
                  toast.success(
                    "Prompt copied — paste it into an AI chat with your content"
                  );
                } catch {
                  toast.error("Could not copy to clipboard");
                }
              }}
            >
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
              checked={value.enabled}
              onCheckedChange={(enabled) => onChange({ ...value, enabled })}
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {value.questions.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No questions yet. Add at least one question to use the quiz.
            </p>
          )}

          {value.questions.map((q, i) => (
            <div key={q.id} className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Question #{i + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() =>
                    onChange({
                      ...value,
                      questions: value.questions.filter((_, idx) => idx !== i),
                    })
                  }
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>

              <Textarea
                placeholder="Enter the question"
                rows={2}
                className="resize-none"
                value={q.question}
                onChange={(e) => updateQuestion(i, { question: e.target.value })}
              />

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Options — select the radio next to the correct answer.
                </p>
                {q.options.map((opt, oi) => (
                  <label key={oi} className="flex items-center gap-3">
                    <input
                      type="radio"
                      name={`answer-${q.id}`}
                      className="h-4 w-4 shrink-0 accent-primary"
                      checked={q.answerIndex === oi}
                      onChange={() => updateQuestion(i, { answerIndex: oi })}
                    />
                    <Input
                      placeholder={`Option ${oi + 1}`}
                      value={opt}
                      onChange={(e) => updateOption(i, oi, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            </div>
          ))}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              onChange({
                ...value,
                questions: [...value.questions, emptyQuizQuestion()],
              })
            }
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
    </div>
  );
}
