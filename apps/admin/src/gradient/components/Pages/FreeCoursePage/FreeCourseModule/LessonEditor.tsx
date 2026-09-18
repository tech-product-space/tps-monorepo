"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Loader2, Save, Settings2 } from "lucide-react";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import { Button } from "@/gradient/components/ui/button";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/gradient/components/ui/alert-dialog";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/gradient/components/ui/breadcrumb";
import { useUnsavedChangesGuard } from "@/gradient/hooks/useUnsavedChangesGuard";
import { openFreeCoursePreview } from "@/gradient/lib/preview";
import { lessonService } from "@/gradient/services/freeCourse/lesson/lesson.service";
import { freeCourseService } from "@/gradient/services/freeCourseService";
import { FreeCourseLesson, Lesson } from "@/gradient/types/freeCourse";
import { cn } from "@/gradient/lib/utils";
import LessonDetailPage from "./LessonDetailPage";
import LessonContentPage from "./LessonContentPage";
import LessonDialog from "./LessonDialog";

interface LessonEditorProps {
  id?: string;
  moduleId?: string;
  isNew?: boolean;
}

/** What the admin was trying to do when the unsaved-content prompt appeared. */
type PendingAction =
  | { type: "switch"; lessonId: string }
  | { type: "link"; href: string }
  | { type: "back" };

export default function LessonEditor({
  id,
  moduleId,
  isNew = false,
}: LessonEditorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Written by the curriculum tab so this page knows where it came from.
  const courseId = searchParams.get("course");
  const fromModuleId = searchParams.get("module") || moduleId;

  const [lesson, setLesson] = useState<FreeCourseLesson | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [switching, setSwitching] = useState(false);
  const [courseTitle, setCourseTitle] = useState<string | null>(null);
  const [moduleTitle, setModuleTitle] = useState<string | null>(null);
  const [moduleSlug, setModuleSlug] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [siblings, setSiblings] = useState<Lesson[]>([]);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [contentDirty, setContentDirty] = useState(false);
  const [savingContent, setSavingContent] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);

  const contentApi = useRef<{ save: () => Promise<boolean> } | null>(null);

  const registerContent = useCallback(
    (api: { save: () => Promise<boolean> }) => {
      contentApi.current = api;
    },
    [],
  );

  const saveContent = useCallback(
    async (): Promise<boolean> => (await contentApi.current?.save()) ?? true,
    [],
  );

  const hrefFor = useCallback(
    (lessonId: string) => {
      const params = new URLSearchParams();
      if (courseId) params.set("course", courseId);
      if (fromModuleId) params.set("module", fromModuleId);
      const query = params.toString();
      return `/free-courses/lesson/edit/${lessonId}${query ? `?${query}` : ""}`;
    },
    [courseId, fromModuleId],
  );

  useEffect(() => {
    if (isNew) {
      // Initialize a skeleton lesson for creation
      setLesson({
        id: "",
        title: "",
        slug: "",
        content: {},
        isPublished: false,
        freeCourseModuleId: moduleId || "",
        order: 0,
        seo: {
          metaTitle: "",
          metaDescription: "",
          metaKeywords: "",
        },
        createdAt: "",
        updatedAt: "",
      } as FreeCourseLesson);
      setLoading(false);
      return;
    }

    const fetchLesson = async () => {
      if (!id) return;
      try {
        const res = await lessonService.getLessonById(id);
        if (res.success) {
          setLesson(res.data);
        } else {
          toast.error("Lesson not found");
          router.back();
        }
      } catch (error) {
        console.error(error);
        toast.error("Failed to fetch lesson");
        router.back();
      } finally {
        setLoading(false);
      }
    };
    fetchLesson();
  }, [id, isNew, moduleId, router]);

  // The module's other lessons — powers the rail, and the breadcrumb labels.
  useEffect(() => {
    if (!courseId) return;

    const loadContext = async () => {
      try {
        const [courseRes, modulesRes] = await Promise.all([
          freeCourseService.getFreeCourseById(courseId),
          freeCourseService.getModulesByCourse(courseId),
        ]);

        if (courseRes.success) setCourseTitle(courseRes.data.title);
        if (modulesRes.success) {
          const current = modulesRes.data.find((m) => m.id === fromModuleId);
          if (current) {
            setModuleTitle(current.title);
            setModuleSlug(current.slug);
            setSiblings(
              [...(current.lessons || [])].sort((a, b) => a.order - b.order),
            );
          }
        }
      } catch (error) {
        console.error(error);
      }
    };

    loadContext();
  }, [courseId, fromModuleId]);

  // Preview lands on the lesson itself, not the course page.
  //
  // This is the only way to read lesson content the way a learner will — the
  // player is behind a sign-in and an enrolment gate, and the lesson may well be
  // a draft inside a draft module inside an unpublished course. The preview link
  // lifts all four. Content is saved first, for the same reason as on the course
  // editor: the preview renders the database, not the editor.
  const openPreview = useCallback(async () => {
    if (contentDirty) {
      setSavingContent(true);
      let saved = false;
      try {
        saved = await saveContent();
      } finally {
        setSavingContent(false);
      }
      if (!saved) return;
    }

    if (!courseId || !moduleSlug || !lesson?.slug) return;

    setPreviewing(true);
    try {
      await openFreeCoursePreview(
        courseId,
        (slug) => `/free-courses/${slug}/${moduleSlug}/${lesson.slug}`,
      );
    } finally {
      setPreviewing(false);
    }
  }, [contentDirty, saveContent, courseId, moduleSlug, lesson?.slug]);

  const backHref = courseId
    ? `/free-courses/${courseId}?tab=curriculum&module=${fromModuleId ?? ""}&lesson=${lesson?.id ?? ""}`
    : "/free-courses";

  // Switching lesson swaps the record in place and rewrites the URL without a
  // navigation, so the rail and the loaded module list survive the change.
  const loadLesson = useCallback(
    async (lessonId: string) => {
      setSwitching(true);
      try {
        const res = await lessonService.getLessonById(lessonId);
        if (res.success) {
          setLesson(res.data);
          setContentDirty(false);
          window.history.replaceState(null, "", hrefFor(lessonId));
        } else {
          toast.error("Lesson not found");
        }
      } catch (error) {
        console.error(error);
        toast.error("Failed to open that lesson");
      } finally {
        setSwitching(false);
      }
    },
    [hrefFor],
  );

  // ── Leaving with unsaved content ──────────────────────────────────────────

  const handleLinkExit = useCallback(
    (href: string) => setPending({ type: "link", href }),
    [],
  );

  const handleBackExit = useCallback(() => setPending({ type: "back" }), []);

  const { allowNavigation, confirmBack } = useUnsavedChangesGuard({
    enabled: contentDirty || pending !== null,
    onNavigate: handleLinkExit,
    onBack: handleBackExit,
  });

  const runAction = useCallback(
    (action: PendingAction) => {
      if (action.type === "switch") {
        // Disarm the guard before anything else. It keeps a sentinel history
        // entry holding the current URL, and tears it down with a back() the
        // moment it stops being armed. That back() is invisible while the
        // sentinel still points at this lesson — but switching rewrites that
        // entry to the *next* lesson, so a late teardown would pop past it and
        // land back on the course page. Disarming first, synchronously, closes
        // that window; the sentinel then becomes the entry replaceState
        // overwrites, so a switch costs no extra back step either.
        allowNavigation();
        setContentDirty(false);
        void loadLesson(action.lessonId);
        return;
      }
      if (action.type === "back") {
        confirmBack();
        return;
      }

      const hadSentinel = allowNavigation();
      if (hadSentinel) router.replace(action.href);
      else router.push(action.href);
    },
    [allowNavigation, confirmBack, loadLesson, router],
  );

  const selectLesson = (lessonId: string) => {
    if (!lesson || lessonId === lesson.id || switching) return;

    if (contentDirty) {
      setPending({ type: "switch", lessonId });
      return;
    }
    void loadLesson(lessonId);
  };

  // In both of these, runAction goes first: it disarms the guard, and clearing
  // `pending` is what flips the guard off. Doing it the other way round lets
  // the teardown run while the sentinel is still armed.
  const discardAndContinue = () => {
    if (!pending) return;
    runAction(pending);
    setContentDirty(false);
    setPending(null);
  };

  const saveAndContinue = async () => {
    if (!pending) return;
    const action = pending;

    const ok = await saveContent();
    if (!ok) {
      setPending(null);
      return;
    }

    runAction(action);
    setPending(null);
  };

  if (loading) {
    return (
      <DashboardLayout title={isNew ? "Add Lesson" : "Edit Lesson"}>
        <div className="flex items-center justify-center p-20">
          <Loader2 className="animate-spin h-6 w-6 text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!lesson) return null;

  const showRail = !isNew && siblings.length > 0;

  return (
    <DashboardLayout
      title={isNew ? "Add Lesson" : lesson.title || "Edit Lesson"}
      actions={
        <div className="flex items-center gap-2">
          {contentDirty && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Unsaved changes
            </span>
          )}
          {!isNew && (
            <Button variant="ghost" onClick={() => setDetailsOpen(true)}>
              <Settings2 className="h-4 w-4" />
              Lesson details
            </Button>
          )}
          {!isNew && courseId && moduleSlug && lesson.slug && (
            <Button
              variant="ghost"
              onClick={() => void openPreview()}
              disabled={savingContent || previewing}
            >
              {previewing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="h-4 w-4" />
              )}
              Preview
            </Button>
          )}
          <Button asChild variant="outline">
            <Link href={backHref}>
              <ArrowLeft className="h-4 w-4" />
              Back to curriculum
            </Link>
          </Button>
          {!isNew && (
            <Button
              onClick={() => void saveContent()}
              disabled={!contentDirty || savingContent}
              className="w-36"
            >
              {savingContent ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Content
                </>
              )}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/free-courses">Free Courses</BreadcrumbLink>
            </BreadcrumbItem>
            {courseId && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href={`/free-courses/${courseId}`}>
                    {courseTitle || "Course"}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </>
            )}
            {fromModuleId && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href={backHref}>
                    {moduleTitle || "Module"}
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </>
            )}
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>
                {isNew ? "New lesson" : lesson.title}
              </BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex items-start gap-6">
          {/* Sibling lessons — jump between them without going back to the
              curriculum and drilling in again. */}
          {showRail && (
            <aside className="hidden w-64 shrink-0 lg:block">
              <div className="sticky top-4 overflow-hidden rounded-lg border bg-card">
                <div className="border-b px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Lessons in this module
                  </p>
                  <p className="truncate text-sm font-medium">
                    {moduleTitle || "Module"}
                  </p>
                </div>

                <ul className="max-h-[65vh] overflow-y-auto p-1">
                  {siblings.map((sibling, index) => {
                    const isActive = sibling.id === lesson.id;
                    return (
                      <li key={sibling.id}>
                        <button
                          type="button"
                          disabled={switching}
                          onClick={() => selectLesson(sibling.id)}
                          className={cn(
                            "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                            "disabled:cursor-not-allowed disabled:opacity-60",
                            isActive
                              ? "bg-primary/10 font-medium text-primary"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground",
                          )}
                        >
                          <span className="w-4 shrink-0 text-[11px] tabular-nums">
                            {index + 1}
                          </span>
                          <span className="min-w-0 flex-1 truncate">
                            {sibling.title}
                          </span>
                          {!sibling.isPublished && (
                            <span
                              className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/50"
                              title="Draft"
                            />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </aside>
          )}

          <div className="min-w-0 flex-1">
            {switching ? (
              <div className="flex items-center justify-center p-20">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : isNew ? (
              /* A brand new lesson has no content to write yet, so it starts
                 on the basics; everything else lands in the content editor. */
              <LessonDetailPage
                lesson={lesson}
                isNew
                moduleId={moduleId}
                onCreated={(newId) => router.replace(hrefFor(newId))}
              />
            ) : (
              /* Keyed so the editor remounts with the new lesson's content —
                 Tiptap reads `initialContent` once, at creation. */
              <LessonContentPage
                key={lesson.id}
                lesson={lesson}
                onRegister={registerContent}
                onDirtyChange={setContentDirty}
                onSavingChange={setSavingContent}
              />
            )}
          </div>
        </div>
      </div>

      {!isNew && detailsOpen && (
        <LessonDialog
          open
          onOpenChange={setDetailsOpen}
          moduleId={lesson.freeCourseModuleId}
          lesson={lesson}
          onSaved={(saved) => {
            setLesson((prev) => (prev ? { ...prev, ...saved } : prev));
            // Keep the rail's title and status badge honest.
            setSiblings((prev) =>
              prev.map((s) => (s.id === lesson.id ? { ...s, ...saved } : s)),
            );
          }}
        />
      )}

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved content</AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.type === "switch"
                ? "Your edits to this lesson have not been saved yet. Save them before opening the other lesson, or discard them."
                : "Your edits to this lesson have not been saved yet. Save them before leaving, or discard them."}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              Stay
            </Button>
            <Button variant="ghost" onClick={discardAndContinue}>
              Discard changes
            </Button>
            <Button onClick={() => void saveAndContinue()}>
              Save &amp; continue
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
