"use client";

import React from "react";
import { Course } from "@/types/course";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";

interface BasicInfoProps {
  form: Partial<Course>;
  setForm: React.Dispatch<React.SetStateAction<Partial<Course>>>;
  slugLoading: boolean;
  slugAvailable: boolean | null;
  slugMessage: string;
}

export const BasicInfo: React.FC<BasicInfoProps> = ({
  form,
  setForm,
  slugLoading,
  slugAvailable,
  slugMessage,
}) => {
  return (
    <Card className="border-gray-200 min-h-[70vh]">
      <CardHeader className="border-b border-gray-100">
        <CardTitle className="text-lg font-semibold">
          Basic Information
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-6 pt-6">
        {/* Row 1: Title + Subtitle */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold tracking-wider">
              Course Title
            </Label>
            <Input
              value={form.title || ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  title: e.target.value,
                }))
              }
              className="focus-visible:ring-blue-600"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold tracking-wider">
              Subtitle
            </Label>
            <Input
              value={form.subtitle || ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  subtitle: e.target.value,
                }))
              }
              className="focus-visible:ring-blue-600"
            />
          </div>
        </div>

        {/* Row 2: URL + Type */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 relative">
            <Label className="text-[13px] font-semibold tracking-wider">
              URL
            </Label>
            <Input
              value={form.slug || ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  slug: e.target.value,
                }))
              }
              className="focus-visible:ring-blue-600"
            />
            {slugLoading && (
              <Loader2 className="absolute right-2 top-8 h-4 w-4 animate-spin text-gray-400" />
            )}
            {slugAvailable !== null && (
              <p
                className={`text-[13px] mt-1 ${
                  slugAvailable ? "text-green-600" : "text-red-600"
                }`}
              >
                {slugMessage}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold tracking-wider">
              Course Type
            </Label>
            <Select
              value={form.type || ""}
              onValueChange={(val) =>
                setForm((prev) => ({ ...prev, type: val as any }))
              }
            >
              <SelectTrigger className="focus:ring-blue-600 w-full ">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="online">Online</SelectItem>
                <SelectItem value="offline">Offline</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Row 3: CTA Text + Duration */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5 relative">
            <Label className="text-[13px] font-semibold tracking-wider">
              CTA Text
            </Label>
            <Input
              value={(form.content as any)?.cta_text || ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  content: {
                    ...(prev.content || {}),
                    cta_text: e.target.value,
                  },
                }))
              }
              placeholder="e.g. Enroll Now"
              className="focus-visible:ring-blue-600"
            />
          </div>

          <div className="space-y-1.5 relative">
            <Label className="text-[13px] font-semibold tracking-wider">
              Total Duration
            </Label>
            <Input
              value={form.duration || ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  duration: e.target.value,
                }))
              }
              placeholder="e.g. 2.5 Hours"
              className="focus-visible:ring-blue-600"
            />
            <p className="text-xs text-muted-foreground">
              Shown on the public course card next to the module count.
            </p>
          </div>
        </div>

        {/* Row 4: Video Course toggle */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-[13px] font-semibold tracking-wider">
              Video Course
            </Label>
            <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2">
              <span className="text-sm text-gray-600">
                Show a video badge on the course listing
              </span>
              <Switch
                checked={!!form.is_video_course}
                onCheckedChange={(checked) =>
                  setForm((prev) => ({ ...prev, is_video_course: checked }))
                }
              />
            </div>
          </div>
        </div>

        {/* Row 5: Description */}
        <div className="space-y-1.5">
          <Label className="text-[13px] font-semibold tracking-wider">
            Description
          </Label>
          <Textarea
            rows={8}
            value={form.description || ""}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                description: e.target.value,
              }))
            }
            className="focus-visible:ring-blue-600 resize-none"
          />
        </div>
      </CardContent>
    </Card>
  );
};
