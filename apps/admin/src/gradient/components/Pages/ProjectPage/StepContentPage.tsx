"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Loader2, Save } from "lucide-react";
import { toast } from "sonner";

import TiptapEditor from "@/gradient/components/TiptapEditor/TiptapEditor";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/gradient/components/ui/breadcrumb";
import { Badge } from "@/gradient/components/ui/badge";
import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Label } from "@/gradient/components/ui/label";
import { Switch } from "@/gradient/components/ui/switch";
import { SlugInput } from "@/gradient/components/Common/SlugInput";
import { isSameContent } from "@/gradient/components/TiptapEditor/contentEquality";

import { projectService } from "@/gradient/services/projectService";
import { ProjectStep } from "@/gradient/types/project";

interface Props {
  projectId: string;
  stepId: string;
}

/**
 * One guide step, with the rest of the guide down the left.
 *
 * The rail is the same idea as the free-course lesson list: writing a guide
 * means moving between steps constantly to keep them consistent, and bouncing
 * out to the project page and back for each hop turns a five-step guide into
 * twenty navigations.
 *
 * `content` is **ProseMirror JSON**, not HTML — that is what carries the code
 * blocks, which are the whole point of a coding guide and already exist
 * (`CodeBlockNode.tsx` plus the Lezer highlighter, mirrored in the public site).
 * Do not swap this for `RichTextEditor`: it emits plain HTML with no code block,
 * which would leave a Python project's guide unable to show Python.
 *
 * **Dirty state is derived, never latched.** It is the loaded step compared
 * against what is in the fields and the editor right now, so typing a character
 * and deleting it again leaves nothing to save. The document comparison is
 * `isSameContent`, not `JSON.stringify`: Postgres re-orders `jsonb` keys, so the
 * stored document and the editor's own output are the same document spelled two
 * different ways — see contentEquality.ts.
 */
export default function StepContentPage({ projectId, stepId }: Props) {
  const router = useRouter();

  const [step, setStep] = useState<ProjectStep | null>(null);
  const [siblings, setSiblings] = useState<ProjectStep[]>([]);
  const [projectTitle, setProjectTitle] = useState("");

  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [contentDirty, setContentDirty] = useState(false);

  // The live document, kept out of React state so a keystroke does not
  // re-render the whole editor. `savedContent` is what the server holds, and
  // moves forward on every successful save.
  const editorData = useRef<{ content: object } | null>(null);
  const savedContent = useRef<unknown>(null);
  /** Which step the loaded state belongs to — see `handleEditorChange`. */
  const loadedStepId = useRef<string | null>(null);

  // The fields compare against the step itself, which is the saved row.
  const dirty =
    contentDirty ||
    (step ? title.trim() !== step.title || slug.trim() !== step.slug : false);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        // All three at once: the breadcrumb needs the project's name and the
        // rail needs its siblings, and the step row carries only its own id.
        const [stepRes, projectRes, stepsRes] = await Promise.all([
          projectService.getStepById(stepId),
          projectService.getProjectById(projectId),
          projectService.getSteps(projectId),
        ]);

        if (cancelled) return;

        if (stepRes.success) {
          setStep(stepRes.data);
          setTitle(stepRes.data.title);
          setSlug(stepRes.data.slug);
          loadedStepId.current = stepRes.data.id;
          savedContent.current = stepRes.data.content ?? {};
          editorData.current = null;
          setContentDirty(false);
        } else {
          toast.error(stepRes.message || "Could not load the step");
        }

        // Both non-fatal: the rail and the breadcrumb degrade rather than
        // stopping the editor from opening.
        if (projectRes.success) setProjectTitle(projectRes.data.title);
        if (stepsRes.success) setSiblings(stepsRes.data);
      } catch (error: any) {
        if (!cancelled) {
          toast.error(
            error.response?.data?.message || "Could not load the step",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [stepId, projectId]);

  /**
   * `id` is the step the emitting editor was mounted for.
   *
   * Tiptap debounces its updates, so the editor being left behind can still
   * emit after the next step has loaded — and that document, compared against
   * the new step's saved content, would mark a step dirty that was never even
   * opened.
   */
  const handleEditorChange = useCallback(
    (id: string, data: { content: object }) => {
      if (loadedStepId.current !== id) return;

      editorData.current = data;
      // Compared against what the server holds, rather than set
      // unconditionally — Tiptap emits an update as it normalises a stored
      // document on load, so a bare `setContentDirty(true)` here would mark
      // every step unsaved the moment it opened.
      setContentDirty(!isSameContent(data.content, savedContent.current));
    },
    [],
  );

  const handleSave = async () => {
    if (!step) return;

    setSaving(true);
    try {
      const content = editorData.current?.content ?? step.content ?? {};

      const data = await projectService.updateStep(step.id, {
        title: title.trim() || step.title,
        slug: slug.trim() || undefined,
        content: content as Record<string, unknown>,
      });

      if (data.success) {
        toast.success("Step saved");
        savedContent.current = content;
        setContentDirty(false);
        setStep(data.data);
        setTitle(data.data.title);
        setSlug(data.data.slug);
        // Keep the rail's label in step with the title just saved.
        setSiblings((prev) =>
          prev.map((s) =>
            s.id === data.data.id
              ? { ...s, title: data.data.title, slug: data.data.slug }
              : s,
          ),
        );
      } else {
        toast.error(data.message || "Could not save the step");
      }
    } catch (error: any) {
      // The 409 names the other step holding the slug — worth showing verbatim.
      toast.error(error.response?.data?.message || "Could not save the step");
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!step) return;

    try {
      const data = await projectService.toggleStepStatus(step.id);
      if (data.success) {
        setStep((prev) =>
          prev ? { ...prev, isPublished: data.isPublished } : prev,
        );
        setSiblings((prev) =>
          prev.map((s) =>
            s.id === step.id ? { ...s, isPublished: data.isPublished } : s,
          ),
        );
        toast.success(data.isPublished ? "Step published" : "Step unpublished");
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Could not change the step");
    }
  };

  /** Catches a tab close or a hard navigation. */
  useEffect(() => {
    if (!dirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  /** Every way out of this editor goes through the same confirm. */
  const leaveTo = (href: string) => {
    if (
      dirty &&
      !window.confirm("You have unsaved changes to this step. Leave anyway?")
    ) {
      return;
    }
    router.push(href);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!step) {
    return <p className="py-20 text-center">Step not found.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/projects">Projects</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {/*
                A plain anchor with a handler, not next/link: leaving with
                unsaved edits has to go through the same confirm the rest of
                this screen uses, and a client-side Link would slip past it.
              */}
              <BreadcrumbLink
                href={`/projects/${projectId}?tab=Guide`}
                onClick={(e) => {
                  e.preventDefault();
                  leaveTo(`/projects/${projectId}?tab=Guide`);
                }}
              >
                {projectTitle || "Guide"}
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{step.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-center gap-4">
          {dirty && (
            <Badge variant="outline" className="text-amber-600">
              Unsaved changes
            </Badge>
          )}

          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Published</Label>
            <Switch
              checked={step.isPublished}
              onCheckedChange={handleTogglePublish}
            />
          </div>

          <Button onClick={handleSave} disabled={saving || !dirty}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save
          </Button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* ── The rest of the guide ────────────────────────────────────── */}
        <aside className="w-60 shrink-0">
          <div className="sticky top-6 space-y-1">
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Guide
            </p>

            {siblings.map((sibling, index) => {
              const active = sibling.id === step.id;

              return (
                <button
                  key={sibling.id}
                  onClick={() =>
                    !active &&
                    leaveTo(`/projects/${projectId}/steps/${sibling.id}`)
                  }
                  className={
                    active
                      ? "flex w-full items-start gap-2 rounded-md bg-muted px-3 py-2 text-left text-sm font-medium"
                      : "flex w-full items-start gap-2 rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }
                >
                  {sibling.isPublished ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                  ) : (
                    <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-40" />
                  )}
                  <span className="min-w-0">
                    <span className="mr-1 opacity-60">{index + 1}.</span>
                    {/* Unsaved title shows live on the active row, so the rail
                        does not disagree with the field being typed into. */}
                    {active ? title || sibling.title : sibling.title}
                  </span>
                </button>
              );
            })}

            <button
              onClick={() => leaveTo(`/projects/${projectId}?tab=Guide`)}
              className="mt-2 w-full rounded-md px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            >
              + Add or reorder steps
            </button>
          </div>
        </aside>

        {/* ── The step ─────────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1 space-y-6">
          <div className="max-w-[720px] space-y-4">
            <div className="space-y-2">
              <Label>Step title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-lg font-medium"
              />
            </div>

            <div className="space-y-1">
              <SlugInput
                label="Step URL"
                value={slug}
                initialSlug={step.slug}
                onChange={(e) => setSlug(e.target.value)}
                checkService={(value) =>
                  projectService.checkStepSlugAvailability(
                    projectId,
                    value,
                    step.id,
                  )
                }
                placeholder="setting-up-the-main-project"
              />
              {step.isPublished && (
                <p className="text-xs text-amber-600">
                  This step is live. Changing its URL breaks any link already
                  shared to it.
                </p>
              )}
            </div>
          </div>

          {/*
            The editor centres itself inside whatever width it is given, so the
            column is capped to its own max width — otherwise it drifts away
            from the fields above on a wide screen. Saving lives in the toolbar
            above; the editor's own toolbar is sticky and would sit on top of a
            button here.
          */}
          <div className="max-w-[720px]">
            <TiptapEditor
              // Keyed on the step so switching in the rail remounts the editor
              // with the new document. Without it, Tiptap keeps the first
              // step's content and every subsequent save overwrites the wrong
              // step.
              key={step.id}
              uploadId={step.id}
              uploadType="project"
              initialContent={step.content}
              onChange={(data) => handleEditorChange(step.id, data)}
              stickyOffset={-24}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
