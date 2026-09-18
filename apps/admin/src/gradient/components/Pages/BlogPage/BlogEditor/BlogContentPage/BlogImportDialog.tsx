"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Download,
  FileText,
  Loader2,
  Upload,
} from "lucide-react";

import { Button } from "@/gradient/components/ui/button";
import { Checkbox } from "@/gradient/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { resolveStorageUrl } from "@/gradient/lib/storage";
import {
  docxToDocument,
  documentToJSON,
  stripLeadingHeading,
  type DocxDocument,
} from "@/gradient/components/TiptapEditor/import/docxToContent";
import {
  BLOG_IMPORT_GUIDE_FILENAME,
  BLOG_IMPORT_GUIDE_MARKDOWN,
} from "../../import/blogImportGuide";

interface BlogImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** S3 entity id for the images pulled out of the document. */
  blogId: string;
  /** Drives the "this will replace what is here" warning. */
  hasExistingContent: boolean;
  /** Receives the ProseMirror JSON to load into the editor. */
  onImported: (content: Record<string, unknown>) => void;
}

/**
 * The preview renders the same HTML the editor will parse, so an image has to
 * resolve its S3 key to a URL the way the editor's image node view does.
 */
function previewFrom(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");

  doc.querySelectorAll("img").forEach((img) => {
    const src = img.getAttribute("src") || "";
    if (src && !src.startsWith("http")) {
      img.setAttribute("src", resolveStorageUrl(src));
    }
  });

  return doc.body.innerHTML;
}

export default function BlogImportDialog({
  open,
  onOpenChange,
  blogId,
  hasExistingContent,
  onImported,
}: BlogImportDialogProps) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState("");
  const [doc, setDoc] = useState<DocxDocument | null>(null);
  const [dropHeading, setDropHeading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Recomputed rather than stored, so ticking the checkbox re-renders the
  // preview without touching the file or re-uploading its images.
  const preview = useMemo(() => {
    if (!doc) return "";
    const html =
      dropHeading && doc.leadingHeading
        ? stripLeadingHeading(doc.html)
        : doc.html;
    return previewFrom(html);
  }, [doc, dropHeading]);

  const reset = () => {
    setFileName(null);
    setDoc(null);
    setError(null);
    setProgress("");
    setDropHeading(true);
    if (inputRef.current) inputRef.current.value = "";
  };

  const close = () => {
    if (parsing) return;
    reset();
    onOpenChange(false);
  };

  const handleDownloadGuide = () => {
    const blob = new Blob([BLOG_IMPORT_GUIDE_MARKDOWN], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = BLOG_IMPORT_GUIDE_FILENAME;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".docx")) {
      setError(
        "That isn't a .docx file. In Google Docs use File > Download > Microsoft Word (.docx).",
      );
      return;
    }

    reset();
    setFileName(file.name);
    setParsing(true);

    try {
      const result = await docxToDocument(file, {
        entityType: "blog",
        entityId: blogId,
        onProgress: setProgress,
      });

      if (result.stats.words === 0 && result.stats.images === 0) {
        setError("That document is empty — there is nothing to import.");
        return;
      }

      setDoc(result);
    } catch (err) {
      console.error("blog docx import failed", err);
      setError(
        (err instanceof Error && err.message) ||
          "Could not read that document. Try re-exporting it.",
      );
    } finally {
      setParsing(false);
      setProgress("");
    }
  };

  const handleApply = () => {
    if (!doc) return;

    onImported(
      documentToJSON(doc.html, {
        dropLeadingHeading: dropHeading && Boolean(doc.leadingHeading),
      }),
    );
    reset();
    onOpenChange(false);
  };

  const stats = doc?.stats;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import from Doc</DialogTitle>
          <DialogDescription>
            Load a Google Doc or Word file into this post. Images are uploaded
            and fenced code becomes code blocks. Nothing is written to the blog
            until you press Save.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Step 1 */}
          <div className="rounded-md border p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">1. Prepare the doc</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Use real heading styles — the on-page contents sidebar is
                  built from Heading 2 and Heading 3. Wrap code in ``` fences.
                  Then export with File &gt; Download &gt; Microsoft Word
                  (.docx).
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={handleDownloadGuide}
              >
                <Download className="mr-2 h-3.5 w-3.5" />
                Formatting guide
              </Button>
            </div>
          </div>

          {/* Step 2 */}
          <div className="space-y-2">
            <p className="text-sm font-medium">2. Upload it</p>

            <label
              htmlFor="blog-docx-input"
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed p-6 text-center transition-colors hover:bg-muted/50"
            >
              {parsing ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {progress || "Working..."}
                  </span>
                </>
              ) : (
                <>
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {fileName || "Click to choose a .docx file"}
                  </span>
                </>
              )}
            </label>
            <input
              ref={inputRef}
              id="blog-docx-input"
              type="file"
              accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden"
              disabled={parsing}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {doc && doc.warnings.length > 0 && (
            <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
              {doc.warnings.map((warning, i) => (
                <p key={i}>{warning}</p>
              ))}
            </div>
          )}

          {/* Step 3 */}
          {doc && stats && (
            <div className="space-y-3">
              <p className="text-sm font-medium">3. Review</p>

              <p className="text-xs text-muted-foreground">
                {stats.words.toLocaleString()} words · {stats.headings} heading
                {stats.headings === 1 ? "" : "s"} · {stats.images} image
                {stats.images === 1 ? "" : "s"} · {stats.codeBlocks} code block
                {stats.codeBlocks === 1 ? "" : "s"} · {stats.tables} table
                {stats.tables === 1 ? "" : "s"}
              </p>

              {doc.leadingHeading && (
                <label className="flex items-start gap-2 rounded-md border p-3 text-xs">
                  <Checkbox
                    checked={dropHeading}
                    onCheckedChange={(value) => setDropHeading(value === true)}
                    className="mt-0.5"
                  />
                  <span>
                    Drop the opening heading{" "}
                    <span className="font-medium">
                      &ldquo;{doc.leadingHeading}&rdquo;
                    </span>
                    <span className="block text-muted-foreground">
                      The post title is set on the Basic Details tab, so keeping
                      this would print it twice on the live page.
                    </span>
                  </span>
                </label>
              )}

              {hasExistingContent && (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    This post already has content. Importing replaces all of it.
                    You can undo with Ctrl+Z, and nothing is written to the blog
                    until you press Save.
                  </span>
                </div>
              )}

              <div
                className="tiptap-content max-h-80 overflow-y-auto rounded-md border bg-white p-4 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:bg-slate-900 [&_pre]:p-3 [&_pre]:text-xs [&_pre]:text-slate-100 [&_table]:w-full [&_td]:border [&_td]:p-1.5 [&_th]:border [&_th]:p-1.5"
                // The HTML is generated by mammoth from the admin's own upload —
                // a fixed set of block tags, with no scripts or event handlers.
                dangerouslySetInnerHTML={{ __html: preview }}
              />
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={parsing}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!doc || parsing}>
            <Upload className="mr-2 h-4 w-4" />
            {hasExistingContent ? "Replace content" : "Import content"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
