"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Cookies from "js-cookie";
import { toast } from "sonner";
import {
  ArrowLeft,
  Eye,
  FileText,
  Layout,
  Loader2,
  Save,
  Sparkles,
  ExternalLink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

import {
  getLessonById,
  getLessonsByModuleId,
  updateLesson,
} from "@/services/courses/lessons";
import { getCompleteCourseDetial } from "@/services/courses/courses";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { openLessonPreview } from "@/lib/preview";

import { LESSON_CONTENT_VERSION, type ICourseLesson } from "@/types/course";
import { LessonGeneralTab } from "./LessonGeneralTab/LessonGeneralTab";
import { LessonContentTab } from "./LessonContentTab";
import { LessonTiptapContent } from "./LessonTiptapContent";
import { LessonPreviewTab } from "./LessonPreviewTab";
import { ConvertToTiptapDialog } from "./ConvertToTiptapDialog";

/** What the admin was trying to do when the unsaved-content prompt appeared. */
type PendingAction =
  | { type: "switch"; lessonId: string }
  | { type: "link"; href: string }
  | { type: "back" };

/**
 * The saved shape of a lesson's metadata, in a fixed key order.
 *
 * The dirty check compares this rather than the whole record. Two reasons, both
 * of which produced a page that claimed unsaved changes the moment it opened:
 * the record carries fields nothing here edits (`content`, `module`,
 * `updatedAt`), and the basic-info form re-emits its values once on mount, which
 * rebuilds the object — same values, but `JSON.stringify` is only as stable as
 * the key order it happens to get.
 */
const metaOf = (lesson: ICourseLesson | null) =>
  JSON.stringify({
    title: lesson?.title ?? "",
    slug: lesson?.slug ?? "",
    status: lesson?.status ?? "",
    seo: {
      title: lesson?.seo_meta?.title ?? "",
      description: lesson?.seo_meta?.description ?? "",
      keywords: lesson?.seo_meta?.keywords ?? [],
    },
  });

const TAB_TRIGGER =
  "data-[state=active]:border-0 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent rounded-none pb-4";

export default function LessonEditorPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();

  const { id: lessonId } = params as { id: string };

  // Written by the curriculum tab so this page knows where it came from. Both
  // are optional: a lesson opened from a bookmark still edits fine, it just has
  // no rail and a shorter breadcrumb.
  const courseParam = searchParams.get("course");
  const moduleId = searchParams.get("module");

  const role = Cookies.get("currentRole");

  const [lesson, setLesson] = useState<ICourseLesson | null>(null);
  const [original, setOriginal] = useState(() => metaOf(null));
  const [originalContent, setOriginalContent] = useState("null");
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);

  const [courseTitle, setCourseTitle] = useState<string | null>(null);
  const [moduleTitle, setModuleTitle] = useState<string | null>(null);
  const [siblings, setSiblings] = useState<ICourseLesson[]>([]);

  const [contentDirty, setContentDirty] = useState(false);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  // v2 keeps its document inside the editor component rather than in `lesson`,
  // so typing does not re-render this page on every keystroke. It hands back a
  // save function instead.
  const contentApi = useRef<{ save: () => Promise<boolean> } | null>(null);

  /** Snapshots the saved state both halves of the dirty check compare against. */
  const markSaved = useCallback((next: ICourseLesson | null) => {
    setOriginal(metaOf(next));
    setOriginalContent(JSON.stringify(next?.content ?? null));
  }, []);

  const registerContent = useCallback(
    (api: { save: () => Promise<boolean> }) => {
      contentApi.current = api;
    },
    [],
  );

  // The lesson carries its own module, and the module its course. Preferred over
  // the query parameter because uploads *require* a course id — the API rejects
  // the request without one — and a lesson opened from a bookmark or a pasted
  // link has no query string at all.
  const courseId = lesson?.module?.course_id ?? courseParam;

  const isTiptap = lesson?.content_version === LESSON_CONTENT_VERSION.TIPTAP;

  // v1 keeps its blocks in `lesson`, so its content has to count towards dirty
  // here; v2's document lives in the editor and is reported separately.
  const metaDirty =
    metaOf(lesson) !== original ||
    (!isTiptap && JSON.stringify(lesson?.content ?? null) !== originalContent);
  const isDirty = metaDirty || contentDirty;

  const hrefFor = useCallback(
    (id: string) => {
      const query = new URLSearchParams();
      if (courseId) query.set("course", courseId);
      if (moduleId) query.set("module", moduleId);
      const suffix = query.toString();
      return `/${role}/free-courses/modules/lessons/${id}${suffix ? `?${suffix}` : ""}`;
    },
    [courseId, moduleId, role],
  );

  const backHref = courseId
    ? `/${role}/free-courses/${courseId}?tab=modules`
    : `/${role}/free-courses`;

  // ── Loading ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      try {
        const data = await getLessonById(lessonId);
        setLesson(data);
        markSaved(data);
      } catch {
        toast.error("Failed to load lesson");
      }
    };
    void load();
  }, [lessonId]);

  // The module's other lessons — this is what the rail lists.
  useEffect(() => {
    if (!moduleId) return;

    const loadSiblings = async () => {
      try {
        const lessons = await getLessonsByModuleId(moduleId);
        setSiblings([...lessons].sort((a, b) => a.order - b.order));
      } catch (error) {
        console.error(error);
      }
    };

    void loadSiblings();
  }, [moduleId]);

  // Breadcrumb labels. One request covers both: `/admin/:id/full` returns the
  // course and its modules, so the module's title comes back with it — there is
  // no endpoint that fetches a single module. Failures are swallowed rather than
  // blocking the editor; a missing label costs nothing.
  useEffect(() => {
    if (!courseId) return;

    const loadTitles = async () => {
      try {
        const res = await getCompleteCourseDetial(courseId);
        setCourseTitle(res?.course?.title ?? null);

        const current = res?.modules?.find(
          (m: { id: string }) => m.id === moduleId,
        );
        setModuleTitle(current?.title ?? null);
      } catch (error) {
        console.error(error);
      }
    };

    void loadTitles();
  }, [courseId, moduleId]);

  // ── Saving ────────────────────────────────────────────────────────────────

  /** Writes the v2 document. Kept separate so the editor owns its own state. */
  const saveDoc = useCallback(
    async (doc: object): Promise<boolean> => {
      if (!lesson) return false;
      try {
        await updateLesson(lesson.id, {
          content: { doc },
          content_version: LESSON_CONTENT_VERSION.TIPTAP,
        });

        // The Preview tab reads the document off `lesson`, so it has to move
        // forward with the save — and `original` with it, or the page would
        // read as dirty the moment it stopped being so.
        const next = {
          ...lesson,
          content: { ...(lesson.content || {}), doc },
        };
        setLesson(next);
        markSaved(next);

        return true;
      } catch {
        toast.error("Failed to save content");
        return false;
      }
    },
    [lesson],
  );

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!lesson) return false;

    setSaving(true);
    try {
      if (metaDirty) {
        await updateLesson(lesson.id, {
          title: lesson.title,
          slug: lesson.slug,
          status: lesson.status,
          seo_meta: lesson.seo_meta,
          // v1 carries its blocks in `lesson`; v2's document is written by the
          // editor's own save below, so sending it here would be a stale copy.
          ...(isTiptap ? {} : { content: lesson.content }),
        });
        markSaved(lesson);
      }

      const contentSaved = (await contentApi.current?.save()) ?? true;
      if (!contentSaved) return false;

      toast.success("Lesson saved");
      setSiblings((prev) =>
        prev.map((s) =>
          s.id === lesson.id
            ? { ...s, title: lesson.title, status: lesson.status }
            : s,
        ),
      );
      return true;
    } catch {
      toast.error("Failed to save lesson");
      return false;
    } finally {
      setSaving(false);
    }
  }, [lesson, metaDirty, isTiptap]);

  /**
   * Opens the lesson on the public site with the publish filters and the
   * enrolment gate lifted.
   *
   * Saves first when there is anything pending: the preview renders the
   * database, not the editor, so previewing dirty work would show the previous
   * version and look like the preview was broken.
   */
  const openPreview = useCallback(async () => {
    if (!lesson) return;

    if (isDirty && !(await handleSave())) return;

    setPreviewing(true);
    try {
      const ok = await openLessonPreview(lesson.id);
      if (!ok) toast.error("Could not open a preview for this lesson");
    } finally {
      setPreviewing(false);
    }
  }, [lesson, isDirty, handleSave]);

  // ── Switching lesson, and leaving with unsaved work ────────────────────────

  // Swaps the record in place and rewrites the URL without a navigation, so the
  // rail and the loaded module list survive the change.
  const loadLesson = useCallback(
    async (id: string) => {
      setSwitching(true);
      try {
        const data = await getLessonById(id);
        setLesson(data);
        markSaved(data);
        setContentDirty(false);
        contentApi.current = null;
        window.history.replaceState(null, "", hrefFor(id));
      } catch {
        toast.error("Failed to open that lesson");
      } finally {
        setSwitching(false);
      }
    },
    [hrefFor],
  );

  const handleLinkExit = useCallback(
    (href: string) => setPending({ type: "link", href }),
    [],
  );

  const handleBackExit = useCallback(() => setPending({ type: "back" }), []);

  const { allowNavigation, confirmBack } = useUnsavedChangesGuard({
    enabled: isDirty || pending !== null,
    onNavigate: handleLinkExit,
    onBack: handleBackExit,
  });

  const runAction = useCallback(
    (action: PendingAction) => {
      if (action.type === "switch") {
        // Disarm the guard before anything else. It keeps a sentinel history
        // entry holding the current URL and tears it down with a back() the
        // moment it stops being armed. That back() is invisible while the
        // sentinel still points at this lesson — but switching rewrites that
        // entry to the *next* lesson, so a late teardown would pop past it and
        // land back on the course page. Disarming first, synchronously, closes
        // that window.
        allowNavigation();
        setContentDirty(false);
        markSaved(lesson);
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
    [allowNavigation, confirmBack, loadLesson, lesson, router],
  );

  const selectLesson = (id: string) => {
    if (!lesson || id === lesson.id || switching) return;
    if (isDirty) {
      setPending({ type: "switch", lessonId: id });
      return;
    }
    void loadLesson(id);
  };

  // In both of these, runAction goes first: it disarms the guard, and clearing
  // `pending` is what flips the guard off. The other order lets the teardown run
  // while the sentinel is still armed.
  const discardAndContinue = () => {
    if (!pending) return;
    runAction(pending);
    setContentDirty(false);
    setPending(null);
  };

  const saveAndContinue = async () => {
    if (!pending) return;
    const action = pending;

    const ok = await handleSave();
    if (!ok) {
      setPending(null);
      return;
    }

    runAction(action);
    setPending(null);
  };

  if (!lesson) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const showRail = siblings.length > 1;

  return (
    <div className="flex h-screen flex-col bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 flex h-16 items-center justify-between border-b bg-white px-5">
        <div className="flex items-center gap-2">
          <SidebarTrigger size="lg" />

          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              isDirty ? setPending({ type: "back" }) : router.push(backHref)
            }
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div>
            <p className="text-lg font-semibold">{lesson.title}</p>
            <p className="font-mono text-xs text-gray-500">ID: {lesson.id}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isDirty && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Unsaved changes
            </span>
          )}

          <Button
            size="sm"
            variant="ghost"
            className="gap-2"
            disabled={previewing || saving}
            onClick={() => void openPreview()}
          >
            {previewing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            Preview
          </Button>

          {/* Only offered on the old format, and only with nothing pending —
              converting writes the whole document, so unsaved block edits would
              be silently overwritten by the version on the server. */}
          {!isTiptap && (
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              disabled={isDirty}
              title={
                isDirty
                  ? "Save your changes before switching editors"
                  : undefined
              }
              onClick={() => setConvertOpen(true)}
            >
              <Sparkles className="h-4 w-4" />
              Switch to new editor
            </Button>
          )}

          <Button
            size="sm"
            className="gap-2 bg-blue-800 hover:bg-blue-900 disabled:opacity-70"
            disabled={!isDirty || saving}
            onClick={() => void handleSave()}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-auto p-6">
        <div className="mb-5">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href={`/${role}/free-courses`}>
                  Free Courses
                </BreadcrumbLink>
              </BreadcrumbItem>

              {courseId && (
                <>
                  <BreadcrumbSeparator />
                  <BreadcrumbItem>
                    <BreadcrumbLink href={backHref}>
                      {courseTitle || "Course"}
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                </>
              )}

              {moduleId && (
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
                <BreadcrumbPage>{lesson.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
        </div>

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
                          {sibling.status !== "published" && (
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
            ) : (
              <Tabs defaultValue="content" className="space-y-6">
                <TabsList className="h-auto w-full justify-start gap-6 rounded-none border-b bg-transparent p-0">
                  <TabsTrigger value="general" className={TAB_TRIGGER}>
                    <Layout className="mr-2 h-4 w-4" />
                    General
                  </TabsTrigger>

                  <TabsTrigger value="content" className={TAB_TRIGGER}>
                    <FileText className="mr-2 h-4 w-4" />
                    Content
                  </TabsTrigger>

                  <TabsTrigger value="preview" className={TAB_TRIGGER}>
                    <Eye className="mr-2 h-4 w-4" />
                    Preview
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="general">
                  <LessonGeneralTab lesson={lesson} setLesson={setLesson} />
                </TabsContent>

                {/* Kept mounted: Tiptap is uncontrolled after creation, so
                    unmounting the tab would throw away unsaved typing. */}
                <TabsContent value="content" forceMount className="data-[state=inactive]:hidden">
                  {isTiptap ? (
                    <LessonTiptapContent
                      key={lesson.id}
                      lesson={lesson}
                      courseId={courseId ?? ""}
                      onRegister={registerContent}
                      onDirtyChange={setContentDirty}
                      onSave={saveDoc}
                    />
                  ) : (
                    <LessonContentTab
                      lesson={lesson}
                      setLesson={setLesson}
                      courseId={courseId ?? ""}
                    />
                  )}
                </TabsContent>

                <TabsContent value="preview">
                  <LessonPreviewTab lesson={lesson} />
                </TabsContent>
              </Tabs>
            )}
          </div>
        </div>
      </div>

      {!isTiptap && convertOpen && (
        <ConvertToTiptapDialog
          open
          onOpenChange={setConvertOpen}
          lesson={lesson}
          onConverted={(converted) => {
            setLesson(converted);
            markSaved(converted);
            setContentDirty(false);
            contentApi.current = null;
          }}
        />
      )}

      {/* Unsaved changes dialog */}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved changes</AlertDialogTitle>
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
    </div>
  );
}
