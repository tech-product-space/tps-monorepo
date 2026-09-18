"use client";

import { SidebarTrigger } from "@/components/ui/sidebar";
import React, { useEffect, useState } from "react";
import CreateCourseDialog from "./CreateCourseDialog";
import ManageTagsDialog from "./ManageTagsDialog";
import { getAllCourses, updateCourseStatus } from "@/services/courses/courses";
import { Course } from "@/types/course";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Edit, Eye, Loader2, Pencil, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function Courses() {
  const router = useRouter();
  const [sync, setSync] = useState(0);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    const fetchCourses = async () => {
      try {
        setLoading(true);
        const data = await getAllCourses();
        setCourses(data);
      } catch (error) {
        console.error("Failed to fetch courses", error);
      } finally {
        setLoading(false);
      }
    };

    fetchCourses();
  }, [sync]);

  const handleStatusUpdate = async () => {
    if (!selectedCourse) return;

    const isPublished = selectedCourse.status.toLowerCase() === "published";
    const newStatus = isPublished ? "draft" : "published";
    try {
      setUpdatingStatus(true);
      await updateCourseStatus(selectedCourse.id, newStatus);
      setCourses((prev) =>
        prev.map((c) =>
          c.id === selectedCourse.id ? { ...c, status: newStatus as any } : c,
        ),
      );
      toast.success(
        `Course ${newStatus.toLowerCase() === "published" ? "published" : "moved to draft"}`,
      );
      setStatusDialogOpen(false);
    } catch (error) {
      toast.error("Failed to update status");
    } finally {
      setUpdatingStatus(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-white">
      <div className="px-5 h-16 flex justify-between items-center border-b border-gray-200">
        <div className="flex items-center gap-2">
          <SidebarTrigger size={"lg"} />
          <p className="text-lg font-semibold text-gray-900">Courses</p>
        </div>
        <div className="flex items-center gap-2">
          <ManageTagsDialog />
          <CreateCourseDialog onSync={() => setSync((prev) => prev + 1)} />
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5 pb-10 bg-gray-50">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-gray-900 font-semibold px-6 py-4">
                    Course
                  </TableHead>
                  <TableHead className="text-gray-900 font-semibold">
                    Type
                  </TableHead>
                  <TableHead className="text-gray-900 font-semibold">
                    Status
                  </TableHead>
                  <TableHead className="text-gray-900 font-semibold">
                    Created At
                  </TableHead>
                  <TableHead className="text-gray-900 font-semibold text-right pr-6">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="h-24 text-center text-gray-500"
                    >
                      No courses found.
                    </TableCell>
                  </TableRow>
                ) : (
                  courses.map((course) => (
                    <TableRow
                      key={course.id}
                      className="hover:bg-gray-50 transition-colors"
                    >
                      <TableCell className="px-6 py-4">
                        <div>
                          <div className="font-medium text-gray-900">
                            {course.title}
                          </div>
                          {course.subtitle && (
                            <div className="text-sm text-gray-500 line-clamp-1">
                              {course.subtitle}
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className="bg-blue-50 text-blue-700 border-blue-200 capitalize font-normal"
                        >
                          {course.type}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div
                          className="flex items-center gap-2 cursor-pointer group"
                          onClick={() => {
                            setSelectedCourse(course);
                            setStatusDialogOpen(true);
                          }}
                        >
                          <p
                            className={`px-2 py-1 rounded-lg text-center w-[90px] text-xs font-medium ${
                              course.status.toLowerCase() === "published"
                                ? "bg-green-100 text-green-800"
                                : "bg-orange-100 text-orange-800"
                            }`}
                          >
                            {course.status.toLowerCase() === "published"
                              ? "Published"
                              : "Draft"}
                          </p>
                          <Pencil
                            size={14}
                            className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-gray-500 text-sm">
                        {format(new Date(course.createdAt), "MMM dd, yyyy")}
                      </TableCell>
                      {/* Actions */}
                      <TableCell className="text-right pr-6">
                        <TooltipProvider>
                          <div className="flex items-center justify-end gap-1">
                            {/* View Enrollments */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-gray-500 hover:text-green-600 hover:bg-green-50"
                                  aria-label="View Enrollments"
                                  onClick={() =>
                                    router.push(
                                      `free-courses/${course.id}/enrollments`,
                                    )
                                  }
                                >
                                  <Users className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>View Enrollments</p>
                              </TooltipContent>
                            </Tooltip>

                            {/* Edit Course */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                                  aria-label="Edit Course"
                                  onClick={() =>
                                    router.push(`free-courses/${course.id}`)
                                  }
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Edit Course</p>
                              </TooltipContent>
                            </Tooltip>

                            {/* Delete Course */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-gray-500 hover:text-red-600 hover:bg-red-50"
                                  aria-label="Delete Course"
                                  // onClick={() => handleDelete(course.id)}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Delete Course</p>
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </TooltipProvider>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <AlertDialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update Course Status</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to{" "}
              {selectedCourse?.status.toLowerCase() === "published"
                ? "unpublish"
                : "publish"}{" "}
              this course?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={updatingStatus}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleStatusUpdate();
              }}
              disabled={updatingStatus}
              className={`text-white transition-colors ${
                selectedCourse?.status.toLowerCase() === "published"
                  ? "bg-orange-600 hover:bg-orange-700"
                  : "bg-green-600 hover:bg-green-700"
              }`}
            >
              {updatingStatus
                ? "Updating..."
                : selectedCourse?.status.toLowerCase() === "published"
                  ? "Move to Draft"
                  : "Publish Now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
