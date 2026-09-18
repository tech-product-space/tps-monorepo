"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import DashboardLayout from "@/gradient/components/DashboardLayout";
import { Badge } from "@/gradient/components/ui/badge";
import { courseService } from "@/gradient/services/courseService";
import { Course } from "@/gradient/types/course";
import OverviewSection from "./OverviewSection";
import PricingSection from "./PricingSection";
import EmailsSection from "./EmailsSection";
import BrochureSection from "./BrochureSection";
import LeadsSection from "./LeadsSection";
import ActivityTimeline from "@/gradient/components/Common/ActivityTimeline/ActivityTimeline";
import { Card, CardContent } from "@/gradient/components/ui/card";

const TABS = [
  { value: "overview", label: "Overview" },
  { value: "pricing", label: "Pricing" },
  { value: "emails", label: "Emails" },
  { value: "brochure", label: "Brochure" },
  { value: "leads", label: "Leads" },
  { value: "history", label: "History" },
] as const;

type TabValue = (typeof TABS)[number]["value"];

const isValidTab = (tab: string | null): tab is TabValue =>
  TABS.some((item) => item.value === tab);

export default function ManageCoursePage({ courseId }: { courseId: string }) {
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);

  const searchParams = useSearchParams();
  const router = useRouter();

  const tabFromUrl = searchParams.get("tab");
  const activeTab: TabValue = isValidTab(tabFromUrl) ? tabFromUrl : "overview";

  // The tab lives in the URL so a half-finished edit survives a refresh and
  // links to a specific tab can be shared.
  const setActiveTab = (tab: TabValue) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`?${params.toString()}`, { scroll: false });
  };

  const fetchCourse = useCallback(async () => {
    try {
      const response = await courseService.getCourseById(courseId);
      setCourse(response.data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchCourse();
  }, [fetchCourse]);

  if (loading) {
    return (
      <DashboardLayout title="Manage Course">
        <div className="flex items-center justify-center p-20">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </DashboardLayout>
    );
  }

  if (!course) {
    return (
      <DashboardLayout title="Manage Course">
        <div className="p-6 text-center">
          <h2 className="text-xl font-semibold">Course not found</h2>
          <p className="text-muted-foreground">
            The requested course could not be retrieved.
          </p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title={`Manage: ${course.name}`}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={course.isPublished ? "default" : "secondary"}>
            {course.isPublished ? "Published" : "Draft"}
          </Badge>
          <span className="text-sm text-muted-foreground">/{course.slug}</span>
        </div>

        <div className="flex space-x-6 overflow-x-auto border-b border-border">
          {TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setActiveTab(tab.value)}
              className={`shrink-0 border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.value
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-muted hover:text-foreground"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <OverviewSection
            key={course.updatedAt}
            course={course}
            onSaved={fetchCourse}
          />
        )}
        {activeTab === "pricing" && (
          <PricingSection
            key={course.updatedAt}
            course={course}
            onSaved={fetchCourse}
          />
        )}
        {activeTab === "emails" && <EmailsSection course={course} />}
        {activeTab === "brochure" && (
          <BrochureSection course={course} onSaved={fetchCourse} />
        )}
        {activeTab === "leads" && <LeadsSection course={course} />}
        {activeTab === "history" && (
          <Card>
            <CardContent className="pt-6">
              <ActivityTimeline entityType="course" entityId={course.id} />
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
