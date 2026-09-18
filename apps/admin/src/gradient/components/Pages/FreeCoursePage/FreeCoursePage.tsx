"use client";

import { useState, useEffect, useCallback } from "react";
import { useFreeCourseStore } from "@/gradient/lib/store/useFreeCourseStore";
import { freeCourseService } from "@/gradient/services/freeCourseService";

import FreeCourseTable from "./FreeCourseTable/FreeCourseTable";
import AddFreeCourse from "./AddFreeCourse/AddFreeCourse";

interface FreeCourse {
  id: string;
  title: string;
  subTitle?: string;
  isPublished: boolean;
  createdAt: string;
}

export default function FreeCoursePage() {
  const { showCreateForm } = useFreeCourseStore();

  const [courses, setCourses] = useState<FreeCourse[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);

  const fetchCourses = useCallback(async () => {
    setFetchLoading(true);

    try {
      const data = await freeCourseService.getAllFreeCourses();

      if (data.success) {
        setCourses(data.data);
      }
    } catch (error) {
      console.error("Error fetching free courses:", error);
    } finally {
      setFetchLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  return (
    <div className="space-y-8">
      {showCreateForm && <AddFreeCourse onSuccess={fetchCourses} />}

      <FreeCourseTable
        courses={courses}
        fetchCourses={fetchCourses}
        fetchLoading={fetchLoading}
      />
    </div>
  );
}