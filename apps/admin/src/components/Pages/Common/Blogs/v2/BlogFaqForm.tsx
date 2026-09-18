"use client";

import { useState } from "react";
import { Copy, FileJson, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Faq } from "./blogV2Form";

interface BlogFaqFormProps {
  value: Faq[];
  onChange: (value: Faq[]) => void;
}

const FAQ_AI_PROMPT = `You are a JSON formatter for a blog FAQ importer. Convert the content I give you into FAQs in this exact JSON format:

[
  { "question": "...", "answer": "..." },
  { "question": "...", "answer": "..." }
]

Rules:
- Output ONLY the raw JSON array — no markdown code fences, no explanation, no text before or after.
- Every item must have exactly two keys: "question" and "answer", both non-empty strings.
- Answers must be plain text only — no HTML, no markdown formatting, no line breaks inside strings (use a single paragraph per answer).
- Escape quotes properly so the JSON is valid and parseable.
- Questions should be clear and end with a question mark.
- Keep answers concise (2–4 sentences), factual, and based only on the content I provide — do not invent details.
- If the input already contains Q&A pairs, preserve their meaning; if it's an article, generate 5–8 FAQs covering its key points.

Here is the content:
`;

const FAQ_JSON_EXAMPLE = `[
  { "question": "What is Product Space?", "answer": "A platform for..." },
  { "question": "How do I enroll?", "answer": "Visit the programs page..." }
]`;

// Accepts a JSON array of {question, answer} (or {q, a}), or an object
// wrapping it as { faqs: [...] }. Returns null if nothing usable.
function parseFaqJson(raw: string): Faq[] | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (data && typeof data === "object" && !Array.isArray(data)) {
    data = (data as { faqs?: unknown }).faqs;
  }
  if (!Array.isArray(data)) return null;

  const faqs: Faq[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") return null;
    const obj = item as Record<string, unknown>;
    const question = obj.question ?? obj.q;
    const answer = obj.answer ?? obj.a;
    if (typeof question !== "string" || typeof answer !== "string") return null;
    if (!question.trim() || !answer.trim()) return null;
    faqs.push({ question: question.trim(), answer: answer.trim() });
  }
  return faqs.length > 0 ? faqs : null;
}

export default function BlogFaqForm({ value, onChange }: BlogFaqFormProps) {
  const [importOpen, setImportOpen] = useState(false);
  const [jsonText, setJsonText] = useState("");

  const updateFaq = (i: number, key: keyof Faq, val: string) =>
    onChange(value.map((f, idx) => (idx === i ? { ...f, [key]: val } : f)));

  const handleImport = () => {
    const faqs = parseFaqJson(jsonText);
    if (!faqs) {
      toast.error(
        'Invalid JSON. Expected an array like [{ "question": "...", "answer": "..." }]'
      );
      return;
    }

    // Skip FAQs whose question already exists (also dedupes within the paste)
    const seen = new Set(value.map((f) => f.question.trim().toLowerCase()));
    const fresh: Faq[] = [];
    for (const faq of faqs) {
      const key = faq.question.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      fresh.push(faq);
    }
    const skipped = faqs.length - fresh.length;

    if (fresh.length === 0) {
      toast.info("All pasted FAQs already exist — nothing imported");
      return;
    }
    onChange([...value, ...fresh]);
    toast.success(
      `Imported ${fresh.length} FAQ${fresh.length > 1 ? "s" : ""}` +
        (skipped > 0 ? `, skipped ${skipped} duplicate${skipped > 1 ? "s" : ""}` : "")
    );
    setJsonText("");
    setImportOpen(false);
  };

  return (
    <div className="space-y-6 w-full max-w-4xl mx-auto px-5 py-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold text-muted-foreground uppercase tracking-wide">
            FAQ
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(FAQ_AI_PROMPT);
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onChange([...value, { question: "", answer: "" }])}
            >
              <Plus className="h-4 w-4 mr-1" />
              Add FAQ
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {value.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No FAQs yet. These render as an accordion on the blog page.
            </p>
          )}
          {value.map((faq, i) => (
            <div key={i} className="border rounded-lg p-4 space-y-3 bg-muted/30">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  FAQ #{i + 1}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive"
                  onClick={() => onChange(value.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Input
                placeholder="Enter the question"
                value={faq.question}
                onChange={(e) => updateFaq(i, "question", e.target.value)}
              />
              <Textarea
                placeholder="Enter the answer"
                rows={3}
                className="resize-none"
                value={faq.answer}
                onChange={(e) => updateFaq(i, "answer", e.target.value)}
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
              Paste an array of question/answer objects. Imported FAQs are
              added below any existing ones.
            </DialogDescription>
          </DialogHeader>
          <pre className="text-xs bg-muted rounded-md p-3 overflow-x-auto text-muted-foreground">
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
    </div>
  );
}
