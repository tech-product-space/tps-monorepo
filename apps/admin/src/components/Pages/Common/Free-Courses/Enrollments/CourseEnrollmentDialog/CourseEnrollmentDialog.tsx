"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import type { ICourseUserEnrollment } from "@/services/courses/enrollment";
import { User, Mail, Phone, Calendar } from "lucide-react";
import { formatDateOnly } from "@/utils/formatDataTime";

interface Props {
  enrollment: ICourseUserEnrollment | null;
  open: boolean;
  onClose: () => void;
}

export function CourseEnrollmentDialog({ enrollment, open, onClose }: Props) {
  if (!enrollment) return null;

  const name = enrollment.name || enrollment.user?.name || "Unknown";
  const email = enrollment.user?.email || "-";
  const phone = enrollment.phone || enrollment.user?.phone || "-";
  const enrollmentDate = enrollment.createdAt;
  const completionRate = Math.round(
    (enrollment.completedLessonsCount / enrollment.totalLessons) * 100,
  );

  const renderFormValue = (key: string, value: unknown) => {
    if (key.toLowerCase().includes("linkedin") && typeof value === "string") {
      let href = value;
      if (!href.startsWith("http")) {
        href = `https://${href}`;
      }

      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:underline font-medium"
        >
          View LinkedIn Profile
        </a>
      );
    }

    return <span>{String(value)}</span>;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-4xl p-0 overflow-hidden rounded-xl">
        {/* Header */}
        <DialogHeader className="px-8 pt-8 pb-6 border-b">
          <div className="space-y-2">
            <DialogTitle className="text-2xl font-bold text-gray-900">
              Learner Enrollment Details
            </DialogTitle>
            <DialogDescription className="text-gray-600">
              Complete progress, enrollment information, and contact details
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="max-h-[70vh] overflow-y-auto px-8 py-6 space-y-6">
          {/* Learner Profile Card */}
          <section className="bg-white rounded-xl border p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Learner Profile
              </h3>
            </div>

            <div className="flex items-start gap-4">
              <Avatar className="h-16 w-16 border-2 border-white shadow-sm">
                <AvatarImage src={enrollment.user?.profile_picture} />
                <AvatarFallback className="text-lg bg-gray-100 text-gray-700">
                  {name[0].toUpperCase()}
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 space-y-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <User className="w-4 h-4 text-gray-400" />
                    <span className="text-sm font-medium text-gray-500">
                      Full Name
                    </span>
                  </div>
                  <p className="text-gray-900 font-medium text-lg ml-6">
                    {name}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Mail className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-500">
                        Email Address
                      </span>
                    </div>
                    <p className="text-gray-900  break-all ml-6">{email}</p>
                  </div>

                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span className="text-sm font-medium text-gray-500">
                        Phone Number
                      </span>
                    </div>
                    <p className="text-gray-900 ml-6">{phone}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Course Progress Card */}
          <section className="bg-white rounded-xl border p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Course Progress
              </h3>
              <span className="text-2xl font-bold text-gray-900">
                {completionRate}%
              </span>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700">
                    Overall Progress
                  </span>
                  <span className="text-sm font-medium text-gray-900">
                    {enrollment.completedLessonsCount}/{enrollment.totalLessons}{" "}
                    lessons
                  </span>
                </div>
                <Progress
                  value={completionRate}
                  className="h-3 bg-gray-200 [&>div]:bg-emerald-600"
                />
              </div>
            </div>
          </section>

          {/* Enrollment Details Card */}
          {enrollment.form_data &&
            Object.keys(enrollment.form_data).length > 0 && (
              <section className="bg-white rounded-xl border p-6 space-y-5">
                <h3 className="text-lg font-semibold text-gray-900">
                  Enrollment Information
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Enrollment Date */}
                  {enrollmentDate && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span className="text-sm font-medium text-gray-500">
                          Enrollment Date
                        </span>
                      </div>
                      <p className="text-gray-900 ">
                        {formatDateOnly(enrollmentDate)}
                      </p>
                    </div>
                  )}

                  {/* Additional form data */}
                  {Object.entries(enrollment.form_data)
                    .filter(([, value]) => {
                      if (value === null || value === undefined) return false;
                      if (typeof value === "string" && value.trim() === "")
                        return false;
                      if (Array.isArray(value) && value.length === 0)
                        return false;
                      return true;
                    })
                    .map(([key, value]) => (
                      <div key={key} className="space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-500 capitalize">
                            {key.replace(/_/g, " ")}
                          </span>
                        </div>
                        <p className="text-gray-900 font-medium">
                          {renderFormValue(key, value)}
                        </p>
                      </div>
                    ))}
                </div>
              </section>
            )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
