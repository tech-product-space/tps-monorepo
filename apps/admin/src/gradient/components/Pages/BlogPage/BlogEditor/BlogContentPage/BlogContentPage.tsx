"use client";

import { useCallback, useRef, useState } from "react";
import { FileUp } from "lucide-react";

import { Button } from "@/gradient/components/ui/button";
import TiptapEditor, {
  type TiptapEditorHandle,
  type TocItem,
} from "@/gradient/components/TiptapEditor/TiptapEditor";
import { blogService } from "@/gradient/services/blogService";
import {
  useBlogEditorSection,
  type SectionSaveResult,
} from "../BlogEditorContext";
import BlogImportDialog from "./BlogImportDialog";

type Props = {
  blogId?: string;
  content?: Record<string, unknown>;
  tableOfContents?: unknown[];
};

/** A doc with no blocks, or a single empty paragraph, counts as empty. */
function hasContent(content?: Record<string, unknown>): boolean {
  const blocks = (content?.content as unknown[] | undefined) ?? [];
  if (blocks.length === 0) return false;
  if (blocks.length > 1) return true;

  const only = blocks[0] as { type?: string; content?: unknown[] } | undefined;
  return only?.type !== "paragraph" || Boolean(only?.content?.length);
}

export default function BlogContentPage({ blogId, content }: Props) {
  // Tiptap only fires onChange on a real edit, so a non-null value means dirty.
  const [editorData, setEditorData] = useState<{
    content: object;
    tableOfContents: TocItem[];
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const editorRef = useRef<TiptapEditorHandle>(null);

  const save = useCallback(async (): Promise<SectionSaveResult> => {
    if (!editorData) return "saved";
    if (!blogId) throw new Error("Blog ID is missing");

    await blogService.updateBlog(blogId, {
      content: editorData.content as Record<string, unknown>,
      tableOfContents: editorData.tableOfContents,
    });

    // Re-baseline so the editor reports itself clean again.
    setEditorData(null);
    return "saved";
  }, [blogId, editorData]);

  useBlogEditorSection("content", editorData !== null, save);

  // Pushed through the editor rather than into `initialContent`: the editor
  // owns the document, and going through it means the import lands as an
  // ordinary (undoable) edit that rebuilds the table of contents and marks the
  // section dirty on its own.
  const handleImported = useCallback((imported: Record<string, unknown>) => {
    editorRef.current?.replaceContent(imported);
  }, []);

  // The current document once edited, the saved one otherwise.
  const liveContent = (editorData?.content as Record<string, unknown>) ?? content;

  return (
    <section className="flex flex-col">
      <div className="mb-2 flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!blogId}
          // Images are uploaded against the blog's id, so there is nothing to
          // import into until the post exists.
          title={
            blogId ? "Import content from a .docx" : "Save the blog first"
          }
          onClick={() => setImportOpen(true)}
        >
          <FileUp className="mr-2 h-3.5 w-3.5" />
          Import from Doc
        </Button>
      </div>

      <TiptapEditor
        blogId={blogId}
        editorRef={editorRef}
        initialContent={content}
        onChange={setEditorData}
      />

      {blogId && (
        <BlogImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          blogId={blogId}
          hasExistingContent={hasContent(liveContent)}
          onImported={handleImported}
        />
      )}
    </section>
  );
}
