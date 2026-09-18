"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Eye, Mail, Calendar, TrendingUp, User } from "lucide-react";
import { format } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import type { ICourseUserEnrollment } from "@/services/courses/enrollment";
import { CourseEnrollmentDialog } from "./CourseEnrollmentDialog/CourseEnrollmentDialog";
import { formatDataTime } from "@/utils/formatDataTime";

interface Props {
  data: ICourseUserEnrollment[];
  loading: boolean;
}

export default function EnrollmentsTable({ data, loading }: Props) {
  const [selected, setSelected] = useState<ICourseUserEnrollment | null>(null);

  const getStatusInfo = (progress: number) => {
    if (progress === 100) {
      return {
        text: "Completed",
        color: "bg-emerald-50 text-emerald-700 border-emerald-200",
        progressColor: "bg-emerald-600",
      };
    }
    if (progress >= 50) {
      return {
        text: "In Progress",
        color: "bg-blue-50 text-blue-700 border-blue-200",
        progressColor: "bg-blue-600",
      };
    }
    if (progress > 0) {
      return {
        text: "Started",
        color: "bg-amber-50 text-amber-700 border-amber-200",
        progressColor: "bg-amber-600",
      };
    }
    return {
      text: "Not Started",
      color: "bg-gray-50 text-gray-700 border-gray-200",
      progressColor: "bg-gray-400",
    };
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center rounded-xl border border-gray-200 bg-white">
        <div className="text-center">
          <Loader2 className="mx-auto h-10 w-10 animate-spin text-gray-400" />
          <p className="mt-3 text-sm text-gray-500">Loading enrollments...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Table Container with subtle elevation */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-200 bg-gray-50/80 hover:bg-gray-50/80">
                <TableHead className="h-14 px-6 font-semibold text-gray-900">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-500" />
                    <span>Learner</span>
                  </div>
                </TableHead>
                <TableHead className="h-14 px-6 font-semibold text-gray-900">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-gray-500" />
                    <span>Enrolled</span>
                  </div>
                </TableHead>
                <TableHead className="h-14 px-6 font-semibold text-gray-900">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-gray-500" />
                    <span>Progress</span>
                  </div>
                </TableHead>
                <TableHead className="h-14 px-6 font-semibold text-gray-900">
                  Status
                </TableHead>
                <TableHead className="h-14 px-6 text-right font-semibold text-gray-900">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {data.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-80 px-6 py-12 text-center"
                  >
                    <div className="flex flex-col items-center justify-center gap-4">
                      <div className="rounded-full bg-gray-100 p-4">
                        <User className="h-8 w-8 text-gray-400" />
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-gray-900">
                          No enrollments found
                        </p>
                        <p className="text-sm text-gray-500">
                          No learners have enrolled in this course yet
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                data.map((enrollment) => {
                  const name =
                    enrollment.name || enrollment.user?.name || "Unknown";
                  const email = enrollment.user?.email || "-";
                  const statusInfo = getStatusInfo(enrollment.progress);

                  return (
                    <TableRow
                      key={enrollment.id}
                      className="group border-b border-gray-100 last:border-0 hover:bg-gray-50/30 transition-colors"
                    >
                      {/* Learner */}
                      <TableCell className="px-6 py-5">
                        <div className="flex items-center gap-4">
                          <Avatar className="h-11 w-11 border-2 border-white shadow-sm">
                            <AvatarImage
                              src={enrollment.user?.profile_picture}
                              className="object-cover"
                            />
                            <AvatarFallback className="bg-linear-to-br from-gray-100 to-gray-200 text-gray-700 font-medium">
                              {name.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>

                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-gray-900 truncate">
                              {name}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <Mail className="h-3 w-3 text-gray-400 shrink-0" />
                              <p className="text-sm text-gray-500 truncate">
                                {email}
                              </p>
                            </div>
                          </div>
                        </div>
                      </TableCell>

                      {/* Enrolled At */}
                      <TableCell className="px-6 py-5">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-gray-900">
                            {formatDataTime(enrollment.createdAt)}
                          </p>
                        </div>
                      </TableCell>

                      {/* Progress */}
                      <TableCell className="px-6 py-5">
                        <div className="space-y-3 min-w-[180px]">
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">
                              {enrollment.progress}%
                            </span>
                            <span className="text-xs text-gray-500">
                              {enrollment.completedLessonsCount}/
                              {enrollment.totalLessons}
                            </span>
                          </div>

                          <Progress
                            value={enrollment.progress}
                            className="h-2 bg-gray-200 [&>div]:bg-emerald-600"
                          />
                        </div>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="px-6 py-5">
                        <Badge
                          className={`px-3 py-1.5 rounded-full border ${statusInfo.color} font-medium`}
                          variant="outline"
                        >
                          {statusInfo.text}
                        </Badge>
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="px-6 py-5 text-right">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSelected(enrollment)}
                          className="h-9 w-9 rounded-md border-gray-300 hover:border-gray-400 hover:bg-gray-50 transition-all group-hover:border-gray-400"
                        >
                          <Eye className="h-4 w-4 text-gray-600" />
                          <span className="sr-only">View details</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <CourseEnrollmentDialog
        enrollment={selected}
        open={!!selected}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
