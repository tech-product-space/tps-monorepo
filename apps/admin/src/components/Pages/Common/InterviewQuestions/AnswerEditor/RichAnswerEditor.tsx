"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Reuse the blog-v2 Tiptap editor in HTML ("answer") mode. Tiptap needs the
// browser, so load it client-side only.
const TiptapEditor = dynamic(
  () => import("@/components/TiptapEditor/TiptapEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    ),
  }
);

interface RichAnswerEditorProps {
  /** Existing answer HTML to edit (empty string for a new answer). */
  initialContent: string;
  onSave: (html: string) => void;
  onCancel: () => void;
  saving?: boolean;
}

export default function RichAnswerEditor({
  initialContent,
  onSave,
  onCancel,
  saving,
}: RichAnswerEditorProps) {
  const [html, setHtml] = useState(initialContent ?? "");

  const isEmpty = !html.trim() || html === "<p></p>";

  return (
    <div className="space-y-3">
      <TiptapEditor
        variant="answer"
        initialHtml={initialContent}
        onChangeHtml={setHtml}
      />

      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={saving || isEmpty}
          onClick={() => onSave(html)}
        >
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}
