"use client";

import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import dynamic from "next/dynamic";
import { Loader2, X } from "lucide-react";

import { Button } from "@/gradient/components/ui/button";
import { Input } from "@/gradient/components/ui/input";
import { Textarea } from "@/gradient/components/ui/textarea";
import { Label } from "@/gradient/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/gradient/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/gradient/components/ui/select";
import { CreateJobPayload } from "@/gradient/types/job";
import { ImagePickerDialog } from "@/gradient/components/ui/ImagePickerDialog/ImagePickerDialog";
import { resolveStorageUrl } from "@/gradient/lib/storage";

import "react-quill-new/dist/quill.snow.css";

const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false });

export const jobSchema = z.object({
  jobType: z.string().min(1, "Job type is required"),
  title: z.string().min(1, "Title is required"),
  location: z.string().min(1, "Location is required"),
  descriptionHtml: z.string().min(1, "Description is required"),
  employmentType: z.enum(["Full-time", "Contract", "Volunteer" , "Internship"]),
  seniorityLevel: z.string().min(1, "Seniority level is required"),
  companyName: z.string().min(1, "Company name is required"),
  companyLogo: z.string().url("Must be a valid URL").or(z.literal("")),
  companyDescription: z.string().min(1, "Company description is required"),
  companyWebsite: z.string().url("Must be a valid URL").or(z.literal("")),
});

export type JobFormValues = z.infer<typeof jobSchema>;

interface JobFormProps {
  initialValues?: Partial<JobFormValues>;
  onSubmit: (values: JobFormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
  loadingLabel: string;
}

export default function JobForm({
  initialValues,
  onSubmit,
  onCancel,
  submitLabel,
  loadingLabel,
}: JobFormProps) {
  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<JobFormValues>({
    resolver: zodResolver(jobSchema),
    defaultValues: {
      jobType: initialValues?.jobType || "",
      title: initialValues?.title || "",
      location: initialValues?.location || "",
      descriptionHtml: initialValues?.descriptionHtml || "",
      employmentType: initialValues?.employmentType || "Full-time",
      seniorityLevel: initialValues?.seniorityLevel || "Entry level",
      companyName: initialValues?.companyName || "",
      companyLogo: initialValues?.companyLogo || "",
      companyDescription: initialValues?.companyDescription || "",
      companyWebsite: initialValues?.companyWebsite || "",
    },
  });

  // Sync initialValues when they change
  useEffect(() => {
    if (initialValues) {
      reset(initialValues);
    }
  }, [initialValues, reset]);

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Job Information */}
      <Card>
        <CardHeader>
          <CardTitle>Job Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="title">Job Title</Label>
            <Input
              id="title"
              placeholder="e.g. Frontend Developer"
              {...register("title")}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="jobType">Job Type</Label>
            <Input
              id="jobType"
              placeholder="e.g. Remote, On-site"
              {...register("jobType")}
            />
            {errors.jobType && (
              <p className="text-xs text-destructive">
                {errors.jobType.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="location">Location</Label>
            <Input
              id="location"
              placeholder="e.g. San Francisco, CA"
              {...register("location")}
            />
            {errors.location && (
              <p className="text-xs text-destructive">
                {errors.location.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="employmentType">Employment Type</Label>
            <Controller
              name="employmentType"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger id="employmentType" className="w-full">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Full-time">Full-time</SelectItem>
                    <SelectItem value="Contract">Contract</SelectItem>
                    <SelectItem value="Volunteer">Volunteer</SelectItem>
                    <SelectItem value="Internship">Internship</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {errors.employmentType && (
              <p className="text-xs text-destructive">
                {errors.employmentType.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="seniorityLevel">Seniority Level</Label>
            <Controller
              name="seniorityLevel"
              control={control}
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger id="seniorityLevel" className="w-full">
                    <SelectValue placeholder="Select seniority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Entry level">Entry level</SelectItem>
                    <SelectItem value="Mid-Senior level">
                      Mid-Senior level
                    </SelectItem>
                    <SelectItem value="Not Applicable">
                      Not Applicable
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {errors.seniorityLevel && (
              <p className="text-xs text-destructive">
                {errors.seniorityLevel.message}
              </p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label>Job Description</Label>
            <div className="border rounded-md  bg-white">
              <Controller
                name="descriptionHtml"
                control={control}
                render={({ field }) => (
                  <div className="job-description-editor">
                    <ReactQuill
                      theme="snow"
                      value={field.value}
                      onChange={field.onChange}
                      modules={{
                        toolbar: [
                          // Headings + paragraph
                          [{ header: [1, 2, 3, false] }],

                          // Text style
                          ["bold", "italic", "underline"],

                          // Lists
                          [{ list: "ordered" }, { list: "bullet" }],

                          // Indent (useful for nested lists from Notion)
                          [{ indent: "-1" }, { indent: "+1" }],

                          // Link + clear formatting
                          ["link", "clean"],
                        ],

                        // ✅ Clean up Notion paste garbage
                        clipboard: {
                          matchVisual: false,
                        },
                      }}
                      formats={[
                        "header",
                        "bold",
                        "italic",
                        "underline",
                        "list",
                        "bullet",
                        "indent",
                        "link",
                      ]}
                      className="min-h-[200px]"
                    />
                  </div>
                )}
              />
            </div>
            {errors.descriptionHtml && (
              <p className="text-xs text-destructive">
                {errors.descriptionHtml.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Company Information */}
      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name</Label>
            <Input
              id="companyName"
              placeholder="e.g. Google"
              {...register("companyName")}
            />
            {errors.companyName && (
              <p className="text-xs text-destructive">
                {errors.companyName.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="companyWebsite">Company Website</Label>
            <Input
              id="companyWebsite"
              placeholder="https://google.com"
              {...register("companyWebsite")}
            />
            {errors.companyWebsite && (
              <p className="text-xs text-destructive">
                {errors.companyWebsite.message}
              </p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="companyLogo">Company Logo</Label>
            <div className="flex flex-col gap-4">
              <Controller
                name="companyLogo"
                control={control}
                render={({ field }) => (
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <Input
                        id="companyLogo"
                        placeholder="Select or enter URL"
                        {...field}
                      />
                    </div>
                    <ImagePickerDialog
                      onSelect={(key) => {
                        const url = resolveStorageUrl(key);
                        field.onChange(url);
                      }}
                    />
                  </div>
                )}
              />
              {watch("companyLogo") && (
                <div className="relative w-20 h-20 border rounded-md overflow-hidden bg-muted group">
                  <img
                    src={watch("companyLogo")}
                    alt="Logo Preview"
                    className="w-full h-full object-contain"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => setValue("companyLogo", "")}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
            {errors.companyLogo && (
              <p className="text-xs text-destructive">
                {errors.companyLogo.message}
              </p>
            )}
          </div>

          <div className="space-y-2 md:col-span-2">
            <Label htmlFor="companyDescription">Company Description</Label>
            <Textarea
              id="companyDescription"
              placeholder="Tell us about the company..."
              rows={4}
              {...register("companyDescription")}
            />
            {errors.companyDescription && (
              <p className="text-xs text-destructive">
                {errors.companyDescription.message}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-4">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              {loadingLabel}
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </form>
  );
}
