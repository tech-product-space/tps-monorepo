"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  getBlogById,
  updateBlog,
  checkSlugAvailability,
} from "@/services/blog/blogService";
import BlogV2DetailForm from "./BlogV2DetailForm";
import BlogContentForm from "./BlogContentForm";
import BlogFaqForm from "./BlogFaqForm";
import BlogQuizForm from "./BlogQuizForm";
import {
  initDetails,
  initContent,
  initFaqs,
  initQuiz,
  buildBlogPayload,
  type DetailsValues,
  type ContentData,
  type Faq,
  type BlogQuiz,
} from "./blogV2Form";

interface BlogV2EditorProps {
  blogId: string;
  routeSegment?: string;
}

type Tab = "basic" | "content" | "faqs" | "quiz";

const TABS: { id: Tab; label: string }[] = [
  { id: "basic", label: "Basic Details" },
  { id: "content", label: "Content" },
  { id: "faqs", label: "FAQs" },
  { id: "quiz", label: "Quiz" },
];

export default function BlogV2Editor({
  blogId,
  routeSegment = "blogs",
}: BlogV2EditorProps) {
  const router = useRouter();
  const role = Cookies.get("currentRole");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [blog, setBlog] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<Tab>("basic");

  // Lifted tab state so a single Save persists everything in one call.
  const [details, setDetails] = useState<DetailsValues | null>(null);
  const [content, setContent] = useState<ContentData | null>(null);
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [quiz, setQuiz] = useState<BlogQuiz>({ enabled: false, questions: [] });

  useEffect(() => {
    (async () => {
      try {
        const data = await getBlogById(blogId);
        setBlog(data);
        setDetails(initDetails(data));
        setContent(initContent(data));
        setFaqs(initFaqs(data));
        setQuiz(initQuiz(data));
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    })();
  }, [blogId]);

  // Has the user changed anything since load / last save?
  const dirty = useMemo(() => {
    if (!blog || !details || !content) return false;
    return (
      JSON.stringify(details) !== JSON.stringify(initDetails(blog)) ||
      JSON.stringify(content) !== JSON.stringify(initContent(blog)) ||
      JSON.stringify(faqs) !== JSON.stringify(initFaqs(blog)) ||
      JSON.stringify(quiz) !== JSON.stringify(initQuiz(blog))
    );
  }, [blog, details, content, faqs, quiz]);

  // Warn on browser/tab close with unsaved changes.
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const handleBack = () => {
    if (
      dirty &&
      !window.confirm("You have unsaved changes. Leave without saving?")
    ) {
      return;
    }
    router.push(`/${role}/${routeSegment}`);
  };

  const handleSave = async () => {
    if (!blog || !details || !content) return;

    if (
      !details.title.trim() ||
      !details.url.trim() ||
      !details.category ||
      !details.subTitle.trim()
    ) {
      toast.error("Title, Subtitle, URL and Category are required");
      setMode("basic");
      return;
    }

    setSaving(true);
    const toastId = toast.loading("Saving...");
    try {
      // Re-check slug uniqueness if it changed.
      if (details.url.trim() !== blog.url) {
        const { available } = await checkSlugAvailability(
          details.url.trim(),
          blog.blog_id,
        );
        if (!available) {
          toast.error("This slug is already taken", { id: toastId });
          setMode("basic");
          setSaving(false);
          return;
        }
      }

      const payload = buildBlogPayload(
        details,
        content,
        faqs,
        quiz,
        blog.content,
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await updateBlog(payload as any, String(blog.blog_id));
      setBlog({ ...blog, ...payload });
      toast.success(
        details.status === "publish" ? "Saved & published" : "Saved as draft",
        { id: toastId },
      );
    } catch (error) {
      console.error(error);
      toast.error("Failed to save blog", { id: toastId });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-20">
        <Loader2 className="animate-spin h-6 w-6" />
      </div>
    );
  }

  if (!blog || !details || !content) {
    return (
      <div className="p-10 text-center">
        <h2 className="text-xl font-semibold">Blog not found</h2>
        <p className="text-muted-foreground">
          The requested blog could not be retrieved.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Header: title + single Save (top right) */}
      <div className="px-5 h-16 flex justify-between items-center border-b shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <p className="text-lg font-semibold truncate">
            {details.title || "Edit Blog"}
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || !dirty}
          className="w-32"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>

      {/* Tab switcher below the header */}
      <div className="px-5 flex gap-1 border-b shrink-0">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setMode(t.id)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              mode === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab panels — kept mounted so edits persist across tab switches */}
      <div className="flex-1 overflow-auto">
        <div className={mode === "basic" ? "" : "hidden"}>
          <BlogV2DetailForm
            value={details}
            onChange={setDetails}
            blogId={blog.blog_id}
            originalUrl={blog.url}
          />
        </div>
        <div className={mode === "content" ? "" : "hidden"}>
          <BlogContentForm
            initialDoc={blog.content?.doc ?? undefined}
            onChange={setContent}
          />
        </div>
        <div className={mode === "faqs" ? "" : "hidden"}>
          <BlogFaqForm value={faqs} onChange={setFaqs} />
        </div>
        <div className={mode === "quiz" ? "" : "hidden"}>
          <BlogQuizForm value={quiz} onChange={setQuiz} />
        </div>
      </div>
    </div>
  );
}
