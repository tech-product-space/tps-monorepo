"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/gradient/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import { Button } from "@/gradient/components/ui/button";
import { Edit, Box, Loader2, RefreshCcw, Trash2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/gradient/components/ui/tooltip";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { freeCourseService } from "@/gradient/services/freeCourseService";
import { FreeCourseStatusToggle } from "./ToggleFreeCourseStatus/ToggleFreeCourseStatus";

interface FreeCourse {
  id: string;
  title: string;
  subTitle?: string;
  isPublished: boolean;
  createdAt: string;
}

interface Props {
  courses: FreeCourse[];
  fetchCourses: () => void;
  fetchLoading: boolean;
}

export default function FreeCourseTable({
  courses,
  fetchCourses,
  fetchLoading,
}: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const router = useRouter();

  const handleEdit = (id: string) => {
    router.push(`/free-courses/${id}`);
  };

  const handleModule = (id: string) => {
    router.push(`/free-courses/${id}?tab=curriculum`);
  };

  const handleDelete = (course: FreeCourse) => {
    toast(`Delete "${course.title}"?`, {
      description: "This action cannot be undone.",
      duration: 8000,
      action: {
        label: "Delete",
        onClick: () => confirmDelete(course.id),
      },
      cancel: {
        label: "Cancel",
        onClick: () => {},
      },
    });
  };

  const confirmDelete = async (id: string) => {
    setDeletingId(id);
    const toastId = toast.loading("Deleting free course...");

    try {
      await freeCourseService.deleteFreeCourse(id);
      toast.success("Free course deleted!", { id: toastId });
      fetchCourses();
    } catch (error: any) {
      toast.error(error.response?.data?.message || "Delete failed", {
        id: toastId,
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Free Courses</CardTitle>

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
                <TableHead>Title</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {fetchLoading ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading courses...
                    </div>
                  </TableCell>
                </TableRow>
              ) : courses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center">
                    No courses found.
                  </TableCell>
                </TableRow>
              ) : (
                courses.map((course) => (
                  <TableRow key={course.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium">{course.title}</p>
                        <p className="text-xs text-muted-foreground truncate max-w-75">
                          {course.subTitle}
                        </p>
                      </div>
                    </TableCell>

                    <TableCell>
                      {new Date(course.createdAt).toLocaleDateString()}
                    </TableCell>

                    <TableCell>
                      <FreeCourseStatusToggle
                        courseId={course.id}
                        isPublished={course.isPublished}
                        refetch={fetchCourses}
                      />
                    </TableCell>

                    <TableCell className="text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleEdit(course.id)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Edit Course</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleModule(course.id)}
                            >
                              <Box className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Curriculum</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={deletingId === course.id}
                              onClick={() => handleDelete(course)}
                            >
                              {deletingId === course.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Delete Course</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
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
