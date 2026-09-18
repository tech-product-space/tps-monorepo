"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";

import type { ContentData } from "./blogV2Form";

// Tiptap relies on the browser; load it client-side only.
const TiptapEditor = dynamic(() => import("@/components/TiptapEditor/TiptapEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center p-20">
      <Loader2 className="animate-spin h-6 w-6" />
    </div>
  ),
});

interface BlogContentFormProps {
  initialDoc: object | null | undefined;
  onChange: (data: ContentData) => void;
}

export default function BlogContentForm({
  initialDoc,
  onChange,
}: BlogContentFormProps) {
  return (
    <section className="flex flex-col px-5 py-6">
      <TiptapEditor
        initialContent={initialDoc ?? undefined}
        onChange={({ content, tableOfContents }) =>
          onChange({ doc: content, tableOfContents })
        }
      />
    </section>
  );
}
