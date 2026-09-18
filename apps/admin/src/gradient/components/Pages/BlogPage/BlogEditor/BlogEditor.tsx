"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlignLeft,
  ExternalLink,
  FileText,
  HelpCircle,
  ListChecks,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

import DashboardLayout from "@/gradient/components/DashboardLayout";
import { Button } from "@/gradient/components/ui/button";
import { TabSwitcher, type TabItem } from "@/gradient/components/ui/custom/TabSwitcher";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/gradient/components/ui/alert-dialog";
import { useUnsavedChangesGuard } from "@/gradient/hooks/useUnsavedChangesGuard";

import { BlogDetailPage } from "./BlogDetailPage/BlogDetailPage";
import BlogContentPage from "./BlogContentPage/BlogContentPage";
import { BlogFaqPage } from "./BlogFaqPage/BlogFaqPage";
import { BlogQuizPage } from "./BlogQuizPage/BlogQuizPage";
import {
  BlogEditorProvider,
  type BlogEditorSectionApi,
} from "./BlogEditorContext";

import { blogService, BlogResponse } from "@/gradient/services/blogService";

type BlogTab = "basic" | "content" | "faq" | "quiz";

const TAB_LABELS: Record<BlogTab, string> = {
  basic: "Basic Details",
  content: "Content",
  faq: "FAQ",
  quiz: "Quiz",
};

// Saved in this order so a failed section reports the earliest tab with errors.
const SAVE_ORDER: BlogTab[] = ["basic", "content", "faq", "quiz"];

type PendingExit = { type: "link"; href: string } | { type: "back" };

export default function BlogEditor({ blogId }: { blogId: string }) {
  const router = useRouter();

  const [blog, setBlog] = useState<BlogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<BlogTab>("basic");
  // Tabs stay mounted once visited so in-progress edits survive tab switches.
  const [visited, setVisited] = useState<Set<BlogTab>>(
    () => new Set<BlogTab>(["basic"]),
  );
  const [faqCount, setFaqCount] = useState(0);
  const [quizCount, setQuizCount] = useState(0);

  const sections = useRef(new Map<string, BlogEditorSectionApi>());
  const [dirtySections, setDirtySections] = useState<Record<string, boolean>>(
    {},
  );
  const dirtyRef = useRef(dirtySections);
  const [saving, setSaving] = useState(false);
  const [pendingExit, setPendingExit] = useState<PendingExit | null>(null);

  useEffect(() => {
    dirtyRef.current = dirtySections;
  }, [dirtySections]);

  const hasChanges = useMemo(
    () => Object.values(dirtySections).some(Boolean),
    [dirtySections],
  );

  useEffect(() => {
    const loadBlog = async () => {
      try {
        const response = await blogService.getBlogById(blogId);

        const blogData = response?.data || (response?.id ? response : null);

        setBlog(blogData);
        setFaqCount(blogData?.faq?.length || 0);
        setQuizCount(blogData?.quiz?.questions?.length || 0);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadBlog();
  }, [blogId]);

  // ── Section registry ────────────────────────────────────────────────────────

  const registerSection = useCallback(
    (id: string, api: BlogEditorSectionApi) => {
      sections.current.set(id, api);
    },
    [],
  );

  const unregisterSection = useCallback((id: string) => {
    sections.current.delete(id);
    setDirtySections((prev) => {
      if (!(id in prev)) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const setSectionDirty = useCallback((id: string, dirty: boolean) => {
    setDirtySections((prev) =>
      prev[id] === dirty ? prev : { ...prev, [id]: dirty },
    );
  }, []);

  const editorApi = useMemo(
    () => ({ registerSection, unregisterSection, setSectionDirty }),
    [registerSection, unregisterSection, setSectionDirty],
  );

  const openTab = useCallback((next: BlogTab) => {
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)));
    setTab(next);
  }, []);

  const handleFaqCountChange = useCallback(
    (count: number) => setFaqCount(count),
    [],
  );

  const handleQuizCountChange = useCallback(
    (count: number) => setQuizCount(count),
    [],
  );

  // ── Saving ──────────────────────────────────────────────────────────────────

  const saveAll = useCallback(async (): Promise<boolean> => {
    const pending = SAVE_ORDER.filter(
      (id) => dirtyRef.current[id] && sections.current.has(id),
    );

    if (pending.length === 0) return true;

    setSaving(true);
    const toastId = toast.loading("Saving changes...");

    try {
      for (const id of pending) {
        const result = await sections.current.get(id)!.save();

        if (result === "invalid") {
          openTab(id);
          toast.error(`Fix the errors in ${TAB_LABELS[id]} before saving`, {
            id: toastId,
          });
          return false;
        }
      }

      toast.success("All changes saved", { id: toastId });
      return true;
    } catch (error) {
      console.error(error);
      toast.error("Failed to save changes", { id: toastId });
      return false;
    } finally {
      setSaving(false);
    }
  }, [openTab]);

  // ── Leaving with unsaved work ───────────────────────────────────────────────

  const handleLinkExit = useCallback(
    (href: string) => setPendingExit({ type: "link", href }),
    [],
  );

  const handleBackExit = useCallback(() => setPendingExit({ type: "back" }), []);

  const { allowNavigation, confirmBack } = useUnsavedChangesGuard({
    // Stays armed while the dialog is open so the sentinel history entry
    // survives a "Save & leave" — otherwise saving would tear it down mid-flight
    // and the back step would overshoot.
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

      // A sentinel entry is standing in for this page — replace it rather than
      // stacking another entry on top, so back still lands where it should.
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
    setDirtySections({});
    leave(exit);
  };

  const saveAndLeave = async () => {
    if (!pendingExit) return;
    const exit = pendingExit;
    const ok = await saveAll();
    setPendingExit(null);
    if (ok) leave(exit);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <DashboardLayout title="Blog Edit">
        <div className="flex items-center justify-center p-20">
          <Loader2 className="animate-spin h-6 w-6" />
        </div>
      </DashboardLayout>
    );
  }

  if (!blog) {
    return (
      <DashboardLayout title="Blog Edit">
        <div className="p-6 text-center">
          <h2 className="text-xl font-semibold">Blog not found</h2>
          <p className="text-muted-foreground">
            The requested blog could not be retrieved.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  const tabs: readonly TabItem<BlogTab>[] = [
    { value: "basic", label: TAB_LABELS.basic, icon: FileText },
    { value: "content", label: TAB_LABELS.content, icon: AlignLeft },
    {
      value: "faq",
      label: TAB_LABELS.faq,
      icon: HelpCircle,
      badge: faqCount || undefined,
    },
    {
      value: "quiz",
      label: TAB_LABELS.quiz,
      icon: ListChecks,
      badge: quizCount || undefined,
    },
  ];

  return (
    <DashboardLayout
      title="Blog Edit"
      actions={
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="hidden text-xs text-muted-foreground sm:inline">
              Unsaved changes
            </span>
          )}

          <Button
            variant="ghost"
            onClick={() =>
              window.open(
                `https://www.thegradient.co.in/blog/${blog.url}`,
                "_blank",
              )
            }
          >
            <ExternalLink className="h-4 w-4" />
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
      <BlogEditorProvider value={editorApi}>
        <div className="w-full space-y-6 pb-6">
          <TabSwitcher tabs={tabs} value={tab} onChange={openTab} />

          {visited.has("basic") && (
            <div className={tab === "basic" ? undefined : "hidden"}>
              <BlogDetailPage blog={blog} />
            </div>
          )}

          {visited.has("content") && (
            <div className={tab === "content" ? undefined : "hidden"}>
              <BlogContentPage
                blogId={blog.id}
                content={blog.content}
                tableOfContents={blog.tableOfContents}
              />
            </div>
          )}

          {visited.has("faq") && (
            <div className={tab === "faq" ? undefined : "hidden"}>
              <BlogFaqPage
                blogId={blog.id}
                faq={blog.faq}
                onCountChange={handleFaqCountChange}
              />
            </div>
          )}

          {visited.has("quiz") && (
            <div className={tab === "quiz" ? undefined : "hidden"}>
              <BlogQuizPage
                blogId={blog.id}
                quiz={blog.quiz}
                onCountChange={handleQuizCountChange}
              />
            </div>
          )}
        </div>
      </BlogEditorProvider>

      <AlertDialog
        open={pendingExit !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setPendingExit(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>You have unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              Changes in{" "}
              {SAVE_ORDER.filter((id) => dirtySections[id])
                .map((id) => TAB_LABELS[id])
                .join(", ")}{" "}
              have not been saved yet. Save them before leaving, or discard them
              and continue.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setPendingExit(null)}
              disabled={saving}
            >
              Stay on page
            </Button>

            <Button
              variant="destructive"
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
