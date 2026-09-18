"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import EnrollmentsTable from "./EnrollmentsTable";
import {
  getCourseEnrollments,
  ICourseUserEnrollment,
} from "@/services/courses/enrollment";
import { IPaginationMeta } from "@/types/pagination";
import Pagination from "@/components/ui/custom/Pagination";
import { ArrowLeft } from "lucide-react";
import { DownloadFreeCourseEnrollments } from "../../Leads/Download/DownloadFreeCourseEnrollments";

export default function CourseEnrollmentPage() {
  const params = useParams();
  const router = useRouter();

  const courseId = Array.isArray(params.courseId)
    ? params.courseId[0]
    : params.courseId;

  const [loading, setLoading] = useState(true);
  const [enrollments, setEnrollments] = useState<ICourseUserEnrollment[]>([]);

  // pagination state
  const [meta, setMeta] = useState<IPaginationMeta>({
    total: 0,
    page: 1,
    limit: 10,
    totalPages: 0,
    hasNextPage: false,
    hasPrevPage: false,
  });

  const fetchData = async (courseId: string, page: number, limit: number) => {
    setLoading(true);

    try {
      const { data, meta } = await getCourseEnrollments(courseId, page, limit);
      setEnrollments(data);
      setMeta(meta);
    } catch (error) {
      console.error("Failed to fetch course enrollment: ", error);
      setEnrollments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (courseId) {
      fetchData(courseId, meta.page, meta.limit);
    }
  }, [courseId]);

  const handlePageChange = (newPage: number) => {
    fetchData(courseId!, newPage, meta.limit);
  };

  const handleLimitChange = (newLimit: number) => {
    fetchData(courseId!, 1, newLimit);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="px-4 h-16 flex items-center gap-4 border-b border-gray-200 bg-white shrink-0">
        <ArrowLeft
          className="h-5 w-5 m-2 cursor-pointer"
          onClick={() => router.back()}
        />

        <span className="h-6 w-px bg-gray-200 mx-1" />

        <div>
          <h1 className="text-lg font-semibold text-gray-900">
            Free Course Enrollments
          </h1>
          <p className="text-sm text-gray-500 leading-none">
            Manage students enrolled in this course
          </p>
        </div>

        {/* Push THIS to right */}
        <div className="ml-auto">
          {courseId && (
            <DownloadFreeCourseEnrollments
              courseId={courseId}
              filename={`enrollments-${courseId}`}
              variant="outline"
            />
          )}
        </div>

        {/* stays next to title (left side) */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-md border border-gray-200">
          <span className="text-xs text-gray-500 uppercase tracking-wide">
            Total Users
          </span>
          <span className="text-sm font-semibold text-gray-900">
            {meta.total}
          </span>
        </div>
      </div>

      {/* Content wrapper */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Scrollable table area */}
        <div className="flex-1 overflow-auto px-4 py-5">
          <EnrollmentsTable data={enrollments} loading={loading} />
        </div>

        {/* Pagination */}
        <div className="shrink-0 py-3 bg-white border-t">
          <Pagination
            meta={meta}
            onPageChange={handlePageChange}
            onLimitChange={handleLimitChange}
          />
        </div>
      </div>
    </div>
  );
}
