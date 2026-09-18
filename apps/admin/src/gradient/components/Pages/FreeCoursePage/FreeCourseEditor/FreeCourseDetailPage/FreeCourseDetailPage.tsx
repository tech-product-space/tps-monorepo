"use client";

import { toast } from "sonner";
import { freeCourseService } from "@/gradient/services/freeCourseService";
import FreeCourseForm, { FreeCourseFormApi } from "../../FreeCourseForm";

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
}

interface FreeCourseDetailPageProps {
  course: FreeCourse;
  onSaved?: (course: any) => void;
  onRegister?: (api: FreeCourseFormApi) => void;
  onDirtyChange?: (dirty: boolean) => void;
}

export default function FreeCourseDetailPage({
  course,
  onSaved,
  onRegister,
  onDirtyChange,
}: FreeCourseDetailPageProps) {
  const onSubmit = async (values: any) => {
    try {
      const res = await freeCourseService.updateFreeCourse(course.id, values);
      if (res.success) {
        toast.success("Free course updated successfully");
        // Keeps the workspace header in sync (title, publish badge) without a
        // reload, which would throw away the curriculum tab's state.
        onSaved?.(res.data ?? { ...course, ...values });
      } else {
        toast.error(res.message || "Failed to update free course");
        throw new Error(res.message || "Update failed");
      }
    } catch (error: any) {
      console.error(error);
      toast.error(
        error.response?.data?.message || "Failed to update free course",
      );
      throw error;
    }
  };

  return (
    <div className="animate-in fade-in duration-500">
      <FreeCourseForm
        initialValues={course}
        onSubmit={onSubmit}
        onRegister={onRegister}
        onDirtyChange={onDirtyChange}
      />
    </div>
  );
}
