"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/gradient/components/DashboardLayout";
import { Button } from "@/gradient/components/ui/button";
import { useAuth } from "@/gradient/context/AuthContext";
import { courseService } from "@/gradient/services/courseService";
import { Course } from "@/gradient/types/course";
import AddCourse from "./AddCourse/AddCourse";
import CourseTable from "./CourseTable";

export default function CoursePage() {
  const { admin } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Creating and deleting a course are Super Admin only. Hiding the controls is
  // convenience — POST /courses/admin/create and the DELETE both requireRole.
  const isSuperAdmin = admin?.role?.name === "Super Admin";

  const fetchCourses = useCallback(async () => {
    setFetchLoading(true);
    try {
      const data = await courseService.getAllCourses();
      setCourses(data.data || []);
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Error fetching courses");
    } finally {
      setFetchLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  return (
    <DashboardLayout
      title="Courses"
      actions={
        isSuperAdmin ? (
          <Button
            onClick={() => setShowCreateForm((open) => !open)}
            variant={showCreateForm ? "outline" : "default"}
          >
            {showCreateForm ? (
              "Cancel"
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Add New Course
              </>
            )}
          </Button>
        ) : null
      }
    >
      <div className="space-y-8">
        {showCreateForm && isSuperAdmin && (
          <AddCourse
            onSuccess={() => {
              setShowCreateForm(false);
              fetchCourses();
            }}
            onCancel={() => setShowCreateForm(false)}
          />
        )}

        <CourseTable
          courses={courses}
          fetchCourses={fetchCourses}
          fetchLoading={fetchLoading}
        />
      </div>
    </DashboardLayout>
  );
}
