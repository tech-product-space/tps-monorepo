"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, Copy, Loader2, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/gradient/components/ui/button";
import { Checkbox } from "@/gradient/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/gradient/components/ui/dialog";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { getApiErrorMessage } from "@/gradient/lib/apiError";
import { freeCourseCertificateService } from "@/gradient/services/freeCourseCertificateService";
import type {
  FreeCourseCertificateCopySource,
  FreeCourseCertificateCopySources,
} from "@/gradient/types/freeCourseCertificate";

/** Long enough not to fire on every keystroke, short enough to feel live. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Copy another course's certificate setup onto this one.
 *
 * Free courses mostly share a design and an email — the same background, the
 * same wording with a different title in it. Rebuilding that per course is how
 * they drift apart: a font changed on one and not the others stays invisible
 * until two learners compare certificates.
 *
 * The list is searched and capped **on the server**. There is no ceiling on how
 * many free courses exist, and a dialog that renders all of them is unusable
 * long before it is slow. What it shows is always accompanied by how many
 * matched in total, so a short list never reads as "that's all there is".
 *
 * The chosen course is held as an object rather than an id, so a selection
 * survives typing a new search that filters it out of view.
 */
export default function CopyFromCourseDialog({
  courseId,
  open,
  onOpenChange,
  onCopied,
}: {
  courseId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after a successful copy so the tabs reload what they show. */
  onCopied: () => void;
}) {
  const [data, setData] = useState<FreeCourseCertificateCopySources | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);

  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");

  const [selected, setSelected] =
    useState<FreeCourseCertificateCopySource | null>(null);
  const [wantTemplate, setWantTemplate] = useState(true);
  const [wantEmail, setWantEmail] = useState(true);

  // Reset on each opening. The dialog is not remounted between opens, so
  // without this it reopens holding the last search and selection.
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setDebounced("");
    setSelected(null);
  }, [open]);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    setLoading(true);

    freeCourseCertificateService
      .copySources(courseId, { search: debounced })
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error(
            getApiErrorMessage(error, "Could not load other courses"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, courseId, debounced]);

  // Only ever ask for what the chosen source can actually give.
  const canTemplate = !!selected?.hasTemplate;
  const canEmail = !!selected?.hasEmail;
  const copyTemplate = wantTemplate && canTemplate;
  const copyEmail = wantEmail && canEmail;

  const pick = (source: FreeCourseCertificateCopySource) => {
    setSelected(source);
    // Default to everything this source has, rather than leaving a tick on a
    // half it cannot supply.
    setWantTemplate(source.hasTemplate);
    setWantEmail(source.hasEmail);
  };

  const replacing = [
    copyTemplate && data?.target.hasTemplate ? "design" : null,
    copyEmail && data?.target.hasEmail ? "email" : null,
  ].filter(Boolean) as string[];

  const handleCopy = async () => {
    if (!selected) return;

    setCopying(true);
    try {
      const result = await freeCourseCertificateService.copyFrom(courseId, {
        fromCourseId: selected.id,
        template: copyTemplate,
        email: copyEmail,
      });

      toast.success(result.message || "Copied");
      onCopied();
      onOpenChange(false);
    } catch (error) {
      toast.error(getApiErrorMessage(error, "Could not copy"));
    } finally {
      setCopying(false);
    }
  };

  const shown = data?.sources.length ?? 0;
  const total = data?.total ?? 0;
  const searching = debounced.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Three things fix the overflow, and all three are needed.

        `sm:max-w-lg` rather than `max-w-lg`: DialogContent's own classes end in
        `sm:max-w-sm`, which wins at that breakpoint and was quietly rendering
        this dialog narrower than intended — which is what pushed the content
        tall enough to spill in the first place.

        `max-h-[85dvh]` because DialogContent sets no height ceiling at all. It
        is `fixed top-1/2 -translate-y-1/2`, so content taller than the viewport
        overflows off *both* edges, and the top half is unreachable — you cannot
        scroll to it, because nothing is scrollable.

        The explicit grid rows because DialogContent is `grid`: without them the
        middle row is sized to its content and the `overflow-y-auto` below never
        engages. `minmax(0,1fr)` is what lets it shrink.
      */}
      <DialogContent
        className="grid-rows-[auto_minmax(0,1fr)_auto] max-h-[85dvh] sm:max-w-lg"
        aria-describedby={undefined}
      >
        <DialogHeader>
          <DialogTitle>Copy from another course</DialogTitle>
        </DialogHeader>

        {/* Scrolls only when it has to; `min-h-0` is what permits it to be
            shorter than its content inside a grid row. */}
        <div className="min-h-0 space-y-4 overflow-y-auto pr-1">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by course or design name"
              className="pl-8"
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !shown ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {searching
                ? "No course matches that."
                : "No other course has a certificate design or email yet. Once one does, you can copy it from here."}
            </p>
          ) : (
            <>
              <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
                {data!.sources.map((source) => {
                  const isSelected = source.id === selected?.id;

                  return (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => pick(source)}
                      className={`flex w-full items-start gap-2.5 rounded-md border p-2.5 text-left transition-colors ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:bg-muted/50"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                          isSelected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/40"
                        }`}
                      >
                        {isSelected && <Check className="h-2.5 w-2.5" />}
                      </span>

                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {source.title}
                        </span>
                        {/* Naming what is there beats a generic "has a
                            template": two courses called "Design" and "Design
                            v2" are told apart by the subject line, not the
                            course name. */}
                        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                          {source.hasTemplate
                            ? `Design: ${source.templateName || "untitled"}`
                            : "No design"}
                          {" · "}
                          {source.hasEmail
                            ? `Email: ${source.emailSubject || "untitled"}`
                            : "No email"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Only when it is actually hiding something. A permanent
                  "showing 3 of 3" is noise. */}
              {total > shown && (
                <p className="text-xs text-muted-foreground">
                  Showing the {shown} most recently updated of {total}. Search
                  to narrow it down.
                </p>
              )}
            </>
          )}

          {selected && (
            <div className="space-y-2 rounded-md border border-border p-3">
              {/* Names the selection, because it may have scrolled out of the
                  list or been filtered away by a later search. */}
              <p className="text-xs font-medium text-foreground">
                Copy from{" "}
                <span className="text-primary">{selected.title}</span>
              </p>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="copy-template"
                  checked={copyTemplate}
                  disabled={!canTemplate}
                  onCheckedChange={(value) => setWantTemplate(value === true)}
                />
                <Label
                  htmlFor="copy-template"
                  className={`text-sm font-normal ${
                    canTemplate ? "" : "text-muted-foreground"
                  }`}
                >
                  Certificate design
                  {!canTemplate && " — this course has none"}
                </Label>
              </div>

              <div className="flex items-center gap-2">
                <Checkbox
                  id="copy-email"
                  checked={copyEmail}
                  disabled={!canEmail}
                  onCheckedChange={(value) => setWantEmail(value === true)}
                />
                <Label
                  htmlFor="copy-email"
                  className={`text-sm font-normal ${
                    canEmail ? "" : "text-muted-foreground"
                  }`}
                >
                  Certificate email
                  {!canEmail && " — this course has none"}
                </Label>
              </div>
            </div>
          )}

          {/* The two things an admin cannot see from here and would be
              surprised by. Both are stated only when they actually apply. */}
          {replacing.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="space-y-1">
                <p>
                  This course already has a {replacing.join(" and an ")}.
                  Copying replaces {replacing.length > 1 ? "them" : "it"}.
                </p>
                {data!.target.issuedCertificates > 0 && copyTemplate && (
                  <p>
                    The {data!.target.issuedCertificates} certificate
                    {data!.target.issuedCertificates === 1 ? "" : "s"} already
                    issued keep the design they were made with — only future
                    ones change.
                  </p>
                )}
              </div>
            </div>
          )}

          {copyEmail && data?.target.hasEmail && (
            <p className="text-xs text-muted-foreground">
              Only the subject and body are copied. Your &ldquo;Send this
              email&rdquo; switch stays as it is.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={copying}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleCopy}
            disabled={copying || !selected || (!copyTemplate && !copyEmail)}
          >
            {copying ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
            Copy
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
