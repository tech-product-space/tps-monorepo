"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  getCompleteCourseDetial,
  updateCourse,
  checkCourseSlugAvailability,
} from "@/services/courses/courses";
import {
  CourseDetailResponse,
  Course,
  UpdateCoursePayload,
} from "@/types/course";
import {
  Loader2,
  ArrowLeft,
  Layout,
  BookOpen,
  HelpCircle,
  Save,
  Newspaper,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ModuleList } from "../Modules/ModuleList";
import { FAQList } from "./FAQs/FAQList";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Refactored Components
import { BasicInfo } from "./GeneralInfo/BasicInfo/BasicInfo";
import { InstructorInfo } from "./GeneralInfo/InstructorInfo/InstructorInfo";
import { SummarySection } from "./GeneralInfo/SummarySection/SummarySection";
import { SEOMeta } from "./GeneralInfo/SEOMeta/SEOMeta";
import { ContentSections } from "./GeneralInfo/ContentSections/ContentSections";
import CertificateTemplate from "./CertificateTemplate/CertificateTemplate";
import { CourseThumbnail } from "./GeneralInfo/CourseThumbnail/CourseThumbnail";
import { TagsSelector } from "./GeneralInfo/TagsSelector/TagsSelector";

const validTabs = ["general", "modules", "faqs"];

export default function CourseDetail() {
  const { courseId } = useParams() as { courseId: string };
  const router = useRouter();
  const [data, setData] = useState<CourseDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const searchParams = useSearchParams();

  const tabFromUrl = searchParams.get("tab");
  const initialTab = validTabs.includes(tabFromUrl || "")
    ? tabFromUrl!
    : "general";

  const [activeTab, setActiveTab] = useState<string>(initialTab);

  // Form State
  const [form, setForm] = useState<Partial<Course>>({});
  const [originalForm, setOriginalForm] = useState<string>("");
  const [newKeyword, setNewKeyword] = useState("");

  // Slug Check State
  const [slugAvailable, setSlugAvailable] = useState<null | boolean>(null);
  const [slugMessage, setSlugMessage] = useState("");
  const [slugLoading, setSlugLoading] = useState(false);
  const [showLeaveDialog, setShowLeaveDialog] = useState(false);
  const isDirty = JSON.stringify(form) !== originalForm;

  const initializeCourseData = (course: Course) => {
    const courseData = { ...course };
    const content = (courseData.content as any) || {};

    if (!Array.isArray(content.sections)) {
      content.sections = [];
    }

    if (!content.instructor) {
      content.instructor = {
        name: "",
        designation: "",
        photo: "",
        linkedin: "",
      };
    }

    if (!content.cta_text) {
      content.cta_text = "";
    }

    if (!content.summarySection) {
      content.summarySection = {
        heading: "",
        items: [],
      };
    }

    courseData.content = content;

    // Ensure seo_meta keywords is an array
    if (courseData.seo_meta && !Array.isArray(courseData.seo_meta.keywords)) {
      courseData.seo_meta.keywords = [];
    } else if (!courseData.seo_meta) {
      courseData.seo_meta = { title: "", keywords: [], description: "" };
    }

    return courseData;
  };

  const fetchDetail = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await getCompleteCourseDetial(courseId);
      setData(res);

      setData(res);

      const initializedData = initializeCourseData(res.course);
      setForm(initializedData);
      setOriginalForm(JSON.stringify(initializedData));
    } catch (error) {
      console.error("Failed to fetch course detail", error);
      toast.error("Failed to load course details");
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (validTabs.includes(tab || "")) {
      setActiveTab(tab!);
    }
  }, [searchParams]);

  useEffect(() => {
    if (courseId) {
      fetchDetail();
    }
  }, [courseId]);

  /* -------- Slug Availability Check -------- */
  useEffect(() => {
    if (
      !form.slug ||
      form.slug.trim() === "" ||
      form.slug === data?.course.slug
    ) {
      setSlugAvailable(null);
      setSlugMessage("");
      return;
    }

    const timer = setTimeout(async () => {
      setSlugLoading(true);
      try {
        const res = await checkCourseSlugAvailability(
          form.slug || "",
          courseId,
        );
        setSlugAvailable(res.available);
        setSlugMessage(
          res.available ? "Slug is available" : "Slug is already taken",
        );
      } catch (error) {
        setSlugAvailable(null);
        setSlugMessage("Error checking slug availability");
      } finally {
        setSlugLoading(false);
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [form.slug, courseId, data?.course.slug]);

  /* -------- Unsaved Changes Warning -------- */
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);

    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);

    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleBack = () => {
    if (isDirty) {
      setShowLeaveDialog(true);
    } else {
      router.back();
    }
  };

  const handleSave = async () => {
    if (slugAvailable === false) {
      toast.error("Please choose a unique slug");
      return;
    }
    try {
      setSaving(true);
      const updates: UpdateCoursePayload = {
        title: form.title,
        subtitle: form.subtitle,
        description: form.description,
        thumbnail: form.thumbnail ?? "",
        thumbnail_video: form.thumbnail_video ?? "",
        duration: form.duration ?? "",
        tagIds: (form.tags ?? []).map((t) => t.id),
        slug: form.slug,
        status: form.status,
        type: form.type,
        is_video_course: !!form.is_video_course,
        // price:
        //   typeof form.price === "string" ? parseFloat(form.price) : form.price,
        content: form.content,
        seo_meta: form.seo_meta,
      };

      await updateCourse(courseId, updates);
      toast.success("Course updated successfully");

      // Refresh data
      const res = await getCompleteCourseDetial(courseId);
      setData(res);

      const initializedData = initializeCourseData(res.course);
      setForm(initializedData);
      setOriginalForm(JSON.stringify(initializedData));
    } catch (error) {
      console.error("Failed to update course", error);
      toast.error("Failed to update course");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data || !form) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <p className="">Course not found</p>
      </div>
    );
  }

  const { course } = data;

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900">
      {/* Header */}
      <div className="px-5 h-16 flex justify-between items-center border-b bg-white sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleBack}
            className="mr-2"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <p className="text-lg font-semibold text-gray-900">
              {course.title}
            </p>
            <p className="text-[13px]  font-mono">ID: {course.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <a
            href={`https://staging-product-space-ui.vercel.app/free-courses/${data?.course?.slug}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button
              variant="outline"
              className="flex items-center gap-2 bg-transparent"
            >
              Course Detail Page
              <ExternalLink className="w-4 h-4" />
            </Button>
          </a>
          {isDirty && (
            <Button
              variant="ghost"
              size="sm"
              className=""
              onClick={() => setForm(JSON.parse(originalForm))}
              disabled={saving}
            >
              Discard
            </Button>
          )}
          <Button
            size="sm"
            className="gap-2 bg-blue-800 hover:bg-blue-900"
            onClick={handleSave}
            disabled={!isDirty || saving}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 scroll-smooth">
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className="space-y-6"
        >
          <TabsList className="bg-transparent border-b rounded-none w-full justify-start h-auto p-0 gap-6">
            <TabsTrigger
              value="general"
              className="data-[state=active]:border-0 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent rounded-none pb-4"
            >
              <Layout className="w-4 h-4 mr-2" />
              General Info
            </TabsTrigger>

            <TabsTrigger
              value="modules"
              className="data-[state=active]:border-0 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent rounded-none pb-4"
            >
              <BookOpen className="w-4 h-4 mr-2" />
              Modules ({data.modules.length})
            </TabsTrigger>
            <TabsTrigger
              value="faqs"
              className="data-[state=active]:border-0 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent rounded-none pb-4"
            >
              <HelpCircle className="w-4 h-4 mr-2" />
              FAQs ({data.faqs.length})
            </TabsTrigger>
            <TabsTrigger
              value="certificate"
              className="data-[state=active]:border-0 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-blue-500 data-[state=active]:bg-transparent rounded-none pb-4"
            >
              <Newspaper className="w-4 h-4 mr-2" />
              Certificate
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-0 outline-none">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Left Column: Basic, Instructor, Summary */}
              <div className="md:col-span-2 space-y-6">
                <BasicInfo
                  form={form}
                  setForm={setForm}
                  slugLoading={slugLoading}
                  slugAvailable={slugAvailable}
                  slugMessage={slugMessage}
                />
                <CourseThumbnail form={form} setForm={setForm} />
                <InstructorInfo form={form} setForm={setForm} />
                <SummarySection form={form} setForm={setForm} />
              </div>

              {/* Right Column: Tags + SEO Meta */}
              <div className="md:col-span-1 space-y-6">
                <TagsSelector form={form} setForm={setForm} />
                <SEOMeta
                  form={form}
                  setForm={setForm}
                  newKeyword={newKeyword}
                  setNewKeyword={setNewKeyword}
                />
              </div>
            </div>

            {/* Bottom Section: Content Sections */}
            <ContentSections form={form} setForm={setForm} />
          </TabsContent>

          <TabsContent value="modules" className="mt-0 outline-none">
            <ModuleList
              courseId={courseId}
              modules={data.modules}
              onRefresh={() => fetchDetail(true)}
            />
          </TabsContent>

          <TabsContent value="faqs" className="mt-0 outline-none">
            <FAQList courseId={courseId} onRefresh={() => fetchDetail(true)} />
          </TabsContent>

          <TabsContent value="certificate" className="mt-0 outline-none">
            <CertificateTemplate courseId={courseId} />
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved Changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Are you sure you want to leave? Your
              changes will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay on Page</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => router.back()}
              className="bg-red-600 hover:bg-red-700"
            >
              Leave Anyway
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
