import React from "react";
import type { ICourseLesson } from "@/types/course";
import { LessonBasicInfoForm } from "./LessonBasicInfoForm";
import { LessonSEOForm } from "./LessonSEOForm";

interface Props {
  lesson: ICourseLesson;
  setLesson: React.Dispatch<React.SetStateAction<ICourseLesson | null>>;
}

export function LessonGeneralTab({ lesson, setLesson }: Props) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* LEFT – Basic Info */}
      <div className="lg:col-span-2 space-y-6">
        <LessonBasicInfoForm
          lesson={lesson}
          onChange={(values) => {
            setLesson((prev) => (prev ? { ...prev, ...values } : prev));
          }}
        />
      </div>

      {/* RIGHT – SEO Meta */}
      <div className="space-y-6">
        <LessonSEOForm
          seoMeta={lesson.seo_meta}
          onChange={(seo) => {
            setLesson((prev) =>
              prev
                ? {
                    ...prev,
                    seo_meta: seo,
                  }
                : prev,
            );
          }}
        />
      </div>
    </div>
  );
}
