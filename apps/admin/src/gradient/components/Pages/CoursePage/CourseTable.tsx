"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import { Badge } from "@/gradient/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import { Button } from "@/gradient/components/ui/button";
import { Switch } from "@/gradient/components/ui/switch";
import { Loader2, RefreshCcw, Settings, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Course } from "@/gradient/types/course";
import { useAuth } from "@/gradient/context/AuthContext";
import { courseService } from "@/gradient/services/courseService";
import { applyDiscount, formatRupees } from "./constants";

export default function CourseTable({
  courses,
  fetchCourses,
  fetchLoading,
}: {
  courses: Course[];
  fetchCourses: () => void;
  fetchLoading: boolean;
}) {
  const router = useRouter();
  const { admin } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);

  // Deleting a course is Super Admin only — enforced by requireRole on
  // DELETE /courses/admin/courses/:id, hidden here so the button isn't a 403.
  const isSuperAdmin = admin?.role?.name === "Super Admin";

  const handleToggle = async (course: Course) => {
    setBusyId(course.id);
    try {
      const response = await courseService.toggleCourseStatus(course.id);
      toast.success(response.message || "Status updated.");
      fetchCourses();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to update status.");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = (course: Course) => {
    toast(`Delete "${course.name}"?`, {
      description: "This action cannot be undone.",
      duration: 8000,
      action: { label: "Delete", onClick: () => confirmDelete(course.id) },
      cancel: { label: "Cancel", onClick: () => {} },
    });
  };

  const confirmDelete = async (id: string) => {
    setBusyId(id);
    const toastId = toast.loading("Deleting course...");
    try {
      await courseService.deleteCourse(id);
      toast.success("Course deleted.", { id: toastId });
      fetchCourses();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Failed to delete course.", {
        id: toastId,
      });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>All Courses</CardTitle>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchCourses}
          disabled={fetchLoading}
        >
          <RefreshCcw
            className={`w-4 h-4 ${fetchLoading ? "animate-spin" : ""}`}
          />
        </Button>
      </CardHeader>

      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Brochure</TableHead>
                <TableHead>Leads</TableHead>
                <TableHead>Published</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {fetchLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading courses...
                    </div>
                  </TableCell>
                </TableRow>
              ) : courses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center">
                    No courses yet.
                  </TableCell>
                </TableRow>
              ) : (
                courses.map((course) => (
                  <TableRow key={course.id}>
                    <TableCell className="font-medium">
                      <p>{course.name}</p>
                      <p className="text-xs font-normal text-muted-foreground">
                        /{course.slug}
                      </p>
                    </TableCell>

                    <TableCell>
                      {course.pricing?.price ? (
                        <div className="flex items-center gap-2">
                          <span>
                            {formatRupees(
                              applyDiscount(
                                course.pricing.price,
                                course.pricing.discountPercent,
                              ),
                            )}
                          </span>
                          {course.pricing.discountPercent > 0 && (
                            <span className="text-xs text-muted-foreground line-through">
                              {formatRupees(course.pricing.price)}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">
                          Not set
                        </span>
                      )}
                    </TableCell>

                    <TableCell>
                      {course.brochure?.fileKey ? (
                        <Badge>Live</Badge>
                      ) : (
                        <Badge variant="outline">None</Badge>
                      )}
                    </TableCell>

                    <TableCell>{course.leadCount ?? 0}</TableCell>

                    <TableCell>
                      <Switch
                        checked={course.isPublished}
                        disabled={busyId === course.id}
                        onCheckedChange={() => handleToggle(course)}
                      />
                    </TableCell>

                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-primary"
                        onClick={() => router.push(`/courses/${course.id}`)}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      {isSuperAdmin && (
                        <Button
                          variant="ghost"
                          size="icon"
                          disabled={busyId === course.id}
                          onClick={() => handleDelete(course)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          {busyId === course.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
