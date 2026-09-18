"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Award,
  ExternalLink,
  FileText,
  HelpCircle,
  History,
  Layers,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import ActivityTimeline from "@/gradient/components/Common/ActivityTimeline/ActivityTimeline";
import { Badge } from "@/gradient/components/ui/badge";
import { Button } from "@/gradient/components/ui/button";
import { Card, CardContent } from "@/gradient/components/ui/card";
import { TabSwitcher, type TabItem } from "@/gradient/components/ui/custom/TabSwitcher";
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
import { freeCourseService } from "@/gradient/services/freeCourseService";
import { FAQ, FreeCourseModule } from "@/gradient/types/freeCourse";

import FreeCourseFaqPage from "../FreeCourseFaq/FreeCourseFaqPage";
import FreeCourseDetailPage from "./FreeCourseDetailPage/FreeCourseDetailPage";
import FreeCourseModulePage from "../FreeCourseModule/FreeCourseModulePage/FreeCourseModulePage";
import CertificateSection from "../CertificateSection/CertificateSection";
import type { FreeCourseFormApi } from "../FreeCourseForm";

interface FreeCourse {
  id: string;
  title: string;
  subTitle: string;
  description: string;
  slug: string;
  isPublished: boolean;
  createdAt: string;
  rightCard?: { [key: number]: string };
  curriculum?: { heading: string; subTitle: string };
  faq?: FAQ[];
}

type CourseTab = "details" | "curriculum" | "faq" | "certificate" | "history";

/** Tabs that hold editable state, saved in this order by the toolbar. */
const SAVE_ORDER = ["details", "faq"] as const;

type SaveableTab = (typeof SAVE_ORDER)[number];

const TAB_LABELS: Record<SaveableTab, string> = {
  details: "Course Details",
  faq: "FAQs",
};

interface SectionApi {
  save: () => Promise<boolean>;
}

type PendingExit = { type: "link"; href: string } | { type: "back" };

export default function FreeCourseEditor({ courseId }: { courseId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [course, setCourse] = useState<FreeCourse | null>(null);
  const [modules, setModules] = useState<FreeCourseModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [dirtySections, setDirtySections] = useState<
    Record<SaveableTab, boolean>
  >({ details: false, faq: false });
  const [pendingExit, setPendingExit] = useState<PendingExit | null>(null);

  const sections = useRef(new Map<SaveableTab, SectionApi>());

  const hasChanges = SAVE_ORDER.some((id) => dirtySections[id]);

  // Seeded from the URL so links land on the right tab — the courses table's
  // Curriculum action, and the trip back from the lesson content editor.
  // Switching tabs afterwards stays local: rewriting the URL here would fight
  // the unsaved-changes guard, which keeps a sentinel history entry.
  const [tab, setTab] = useState<CourseTab>(() => {
    const initial = searchParams.get("tab");
    return initial === "curriculum" ||
      initial === "faq" ||
      initial === "certificate" ||
      initial === "history"
      ? initial
      : "details";
  });

  const loadModules = useCallback(async () => {
    try {
      const response = await freeCourseService.getModulesByCourse(courseId);
      if (response.success) setModules(response.data);
    } catch (error) {
      console.error(error);
      toast.error("Failed to fetch modules");
    }
  }, [courseId]);

  useEffect(() => {
    const load = async () => {
      try {
        const [courseRes] = await Promise.all([
          freeCourseService.getFreeCourseById(courseId),
          loadModules(),
        ]);

        if (courseRes.success) setCourse(courseRes.data);
      } catch (error) {
        console.error(error);
        toast.error("Failed to fetch course details");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [courseId, loadModules]);

  const registerDetails = useCallback((api: FreeCourseFormApi) => {
    sections.current.set("details", api);
  }, []);

  const registerFaq = useCallback((api: SectionApi) => {
    sections.current.set("faq", api);
  }, []);

  const setDetailsDirty = useCallback(
    (dirty: boolean) =>
      setDirtySections((prev) =>
        prev.details === dirty ? prev : { ...prev, details: dirty },
      ),
    [],
  );

  const setFaqDirty = useCallback(
    (dirty: boolean) =>
      setDirtySections((prev) =>
        prev.faq === dirty ? prev : { ...prev, faq: dirty },
      ),
    [],
  );

  // Saves every tab holding edits, not just the visible one, and stops at the
  // first that fails so the admin is not told "saved" when half of it wasn't.
  const saveAll = useCallback(async (): Promise<boolean> => {
    const pending = SAVE_ORDER.filter(
      (id) => dirtySections[id] && sections.current.has(id),
    );

    if (pending.length === 0) return true;

    setSaving(true);
    try {
      for (const id of pending) {
        const ok = await sections.current.get(id)!.save();
        if (!ok) {
          setTab(id);
          toast.error(`Fix the errors in ${TAB_LABELS[id]} before saving.`);
          return false;
        }
      }
      return true;
    } finally {
      setSaving(false);
    }
  }, [dirtySections]);

  // Preview saves first.
  //
  // The preview renders what is in the database, not what is on screen, so
  // opening it with edits pending would show the admin their previous work and
  // look like the preview was broken. Saving first is what makes "preview" mean
  // what it says; it is not a publish, and the course stays as unpublished as it
  // was. A failed save stops here — `saveAll` has already switched to the
  // offending tab and said why.
  const openPreview = useCallback(
    async (buildPath?: (slug: string) => string) => {
      if (hasChanges && !(await saveAll())) return;

      setPreviewing(true);
      try {
        await openFreeCoursePreview(courseId, buildPath);
      } finally {
        setPreviewing(false);
      }
    },
    [courseId, hasChanges, saveAll],
  );

  // ── Leaving with unsaved work ─────────────────────────────────────────────

  const handleLinkExit = useCallback(
    (href: string) => setPendingExit({ type: "link", href }),
    [],
  );

  const handleBackExit = useCallback(() => setPendingExit({ type: "back" }), []);

  const { allowNavigation, confirmBack } = useUnsavedChangesGuard({
    enabled: hasChanges || pendingExit !== null,
    onNavigate: handleLinkExit,
    onBack: handleBackExit,
  });

  const leave = useCallback(
    (exit: PendingExit) => {
      if (exit.type === "back") {
        confirmBack();
        return;
      }

      const hadSentinel = allowNavigation();
      if (hadSentinel) router.replace(exit.href);
      else router.push(exit.href);
    },
    [allowNavigation, confirmBack, router],
  );

  const leaveWithoutSaving = () => {
    if (!pendingExit) return;
    const exit = pendingExit;
    setPendingExit(null);
    setDirtySections({ details: false, faq: false });
    leave(exit);
  };

  const saveAndLeave = async () => {
    if (!pendingExit) return;
    const exit = pendingExit;
    const ok = await saveAll();
    setPendingExit(null);
    if (ok) leave(exit);
  };

  const lessonCount = useMemo(
    () =>
      modules.reduce(
        (total, module) => total + (module.lessons?.length || 0),
        0,
      ),
    [modules],
  );

  if (loading) {
    return (
      <DashboardLayout title="Edit Free Course">
        <div className="flex items-center justify-center p-20">
          <Loader2 className="animate-spin h-6 w-6 text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!course) {
    return (
      <DashboardLayout title="Edit Free Course">
        <div className="p-6 text-center">
          <h2 className="text-xl font-semibold">Course not found</h2>
          <p className="text-muted-foreground">
            The requested course could not be retrieved.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const tabs: readonly TabItem<CourseTab>[] = [
    { value: "details", label: "Course Details", icon: FileText },
    {
      value: "curriculum",
      label: "Curriculum",
      icon: Layers,
      badge: modules.length || undefined,
    },
    {
      value: "faq",
      label: TAB_LABELS.faq,
      icon: HelpCircle,
      badge: course.faq?.length || undefined,
    },
    { value: "certificate", label: "Certificate", icon: Award },
    { value: "history", label: "History", icon: History },
  ];

  return (
    <DashboardLayout
      title={course.title}
      actions={
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Unsaved changes
            </span>
          )}

          <Button
            variant="ghost"
            onClick={() => void openPreview()}
            disabled={saving || previewing}
          >
            {previewing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )}
            Preview
          </Button>

          <Button
            onClick={() => void saveAll()}
            disabled={!hasChanges || saving}
            className="w-36"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </div>
      }
    >
      <div className="w-full space-y-5 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/free-courses">
                  Free Courses
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{course.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

          <div className="flex items-center gap-2">
            {course.isPublished ? (
              <Badge className="bg-green-500/10 text-green-600 border-green-500/20">
                Published
              </Badge>
            ) : (
              <Badge variant="secondary">Draft</Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {modules.length} modules · {lessonCount} lessons
            </span>
          </div>
        </div>

        <TabSwitcher tabs={tabs} value={tab} onChange={setTab} />

        {/* Both editors stay mounted so switching tabs never drops unsaved
            form state or the expanded modules below. */}
        <div className={tab === "details" ? undefined : "hidden"}>
          <FreeCourseDetailPage
            course={course}
            onSaved={setCourse}
            onRegister={registerDetails}
            onDirtyChange={setDetailsDirty}
          />
        </div>

        <div className={tab === "curriculum" ? undefined : "hidden"}>
          <FreeCourseModulePage
            modules={modules}
            courseId={courseId}
            courseIsPublished={course.isPublished}
            onModulesChange={setModules}
            onRefetch={loadModules}
          />
        </div>

        <div className={tab === "faq" ? undefined : "hidden"}>
          <FreeCourseFaqPage
            courseId={courseId}
            faq={course.faq ?? []}
            onSaved={(faq) =>
              setCourse((prev) => (prev ? { ...prev, faq } : prev))
            }
            onRegister={registerFaq}
            onDirtyChange={setFaqDirty}
          />
        </div>

        {tab === "certificate" && (
          <CertificateSection courseId={course.id} courseTitle={course.title} />
        )}

        {tab === "history" && (
          <Card>
            <CardContent className="pt-6">
              <ActivityTimeline entityType="freeCourse" entityId={course.id} />
            </CardContent>
          </Card>
        )}
      </div>

      <AlertDialog
        open={pendingExit !== null}
        onOpenChange={(open) => {
          if (!open) setPendingExit(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              Your edits to{" "}
              {SAVE_ORDER.filter((id) => dirtySections[id])
                .map((id) => TAB_LABELS[id])
                .join(" and ")}{" "}
              have not been saved yet. Save them before leaving, or discard
              them.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingExit(null)}
              disabled={saving}
            >
              Stay
            </Button>
            <Button
              variant="ghost"
              onClick={leaveWithoutSaving}
              disabled={saving}
            >
              Leave without saving
            </Button>
            <Button onClick={() => void saveAndLeave()} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save & leave"
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
