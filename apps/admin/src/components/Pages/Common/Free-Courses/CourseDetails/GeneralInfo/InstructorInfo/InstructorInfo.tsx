"use client";

import React from "react";
import { Course } from "@/types/course";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

interface InstructorInfoProps {
  form: Partial<Course>;
  setForm: React.Dispatch<React.SetStateAction<Partial<Course>>>;
}

export const InstructorInfo: React.FC<InstructorInfoProps> = ({
  form,
  setForm,
}) => {
  return (
    <Card className="border-gray-200 mt-6">
      <CardHeader className="border-b border-gray-100">
        <CardTitle className="text-lg font-semibold">
          Instructor Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold tracking-wider">
              Instructor Name
            </Label>
            <Input
              value={(form.content as any)?.instructor?.name || ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  content: {
                    ...(prev.content || {}),
                    instructor: {
                      ...((prev.content as any)?.instructor || {}),
                      name: e.target.value,
                    },
                  },
                }))
              }
              placeholder="e.g. John Doe"
              className="focus-visible:ring-blue-600 shadow-sm border-gray-200"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold tracking-wider">
              Instructor Designation
            </Label>
            <Input
              value={(form.content as any)?.instructor?.designation || ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  content: {
                    ...(prev.content || {}),
                    instructor: {
                      ...((prev.content as any)?.instructor || {}),
                      designation: e.target.value,
                    },
                  },
                }))
              }
              placeholder="e.g. Senior Product Manager"
              className="focus-visible:ring-blue-600 shadow-sm border-gray-200"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold tracking-wider">
              Instructor Photo URL
            </Label>
            <Input
              value={(form.content as any)?.instructor?.photo || ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  content: {
                    ...(prev.content || {}),
                    instructor: {
                      ...((prev.content as any)?.instructor || {}),
                      photo: e.target.value,
                    },
                  },
                }))
              }
              placeholder="https://example.com/photo.jpg"
              className="focus-visible:ring-blue-600 shadow-sm border-gray-200"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold tracking-wider">
              Instructor LinkedIn URL
            </Label>
            <Input
              value={(form.content as any)?.instructor?.linkedin || ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  content: {
                    ...(prev.content || {}),
                    instructor: {
                      ...((prev.content as any)?.instructor || {}),
                      linkedin: e.target.value,
                    },
                  },
                }))
              }
              placeholder="https://linkedin.com/in/username"
              className="focus-visible:ring-blue-600 shadow-sm border-gray-200"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
