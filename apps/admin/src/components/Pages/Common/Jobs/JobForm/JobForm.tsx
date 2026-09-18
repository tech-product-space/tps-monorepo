"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Loader2 } from "lucide-react";
import ReactQuill from "react-quill-new";
import { Job } from "../Jobs";
import Cookies from "js-cookie";

const employmentTypes = [
  "Full-time",
  "Part-time",
  "Contract",
  "Freelance",
  "Internship",
  "Remote",
];

const seniorityLevels = [
  "Entry level",
  "Mid-Senior level",
  "Associate",
  "Director",
];

const jobFormSchema = z.object({
  title: z
    .string()
    .min(3, { message: "Job title must be at least 3 characters" }),
  companyName: z.string().min(2, { message: "Company name is required" }),
  companyLogo: z
    .string()
    .url({ message: "Please enter a valid URL for the company logo" }),
  location: z.string().min(2, { message: "Location is required" }),
  employmentType: z
    .string()
    .min(1, { message: "Please select an employment type" }),
  //   salaryInfo: z.string().min(1, { message: "Salary information is required" }),
  seniorityLevel: z
    .string()
    .min(1, { message: "Please select a seniority level" }),
  descriptionText: z.string().min(10, {
    message: "Job description text must be at least 10 characters",
  }),
  descriptionHtml: z
    .string()
    .min(10, { message: "Job description must be at least 10 characters" }),
  link: z
    .string()
    .url({ message: "Please enter a valid URL for the job posting" }),
});

type JobFormValues = z.infer<typeof jobFormSchema>;

const toolbarOptions = [
  [{ font: [] }],
  [{ header: [1, 2, 3, 4, 5, 6, false] }],
  ["bold", "italic", "underline", "strike"],
  [{ color: [] }, { background: [] }],
  [{ script: "sub" }, { script: "super" }],
  [{ list: "ordered" }, { list: "bullet" }],
  [{ indent: "-1" }, { indent: "+1" }],
  [{ align: [] }],
  ["blockquote", "code-block"],
  ["link", "image", "video"],
  ["clean"],
];

export function JobForm({
  jobs,
  handleChange,
}: {
  jobs: Job;
  handleChange: (value: string) => void;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();
  const role = Cookies.get("currentRole");
  const form = useForm<JobFormValues>({
    resolver: zodResolver(jobFormSchema),
    defaultValues: {
      title: jobs.title || "",
      companyName: jobs.companyName || "",
      companyLogo: jobs.companyLogo || "",
      location: jobs.location || "",
      employmentType: jobs.employmentType || "",
      //   salaryInfo: jobs.salaryInfo || "",
      seniorityLevel: jobs.seniorityLevel || "",
      descriptionText: jobs.descriptionText || "",
      descriptionHtml: jobs.descriptionHtml || "",
      link: jobs.link || "",
    },
  });

  async function onSubmit(data: JobFormValues) {
    setIsSubmitting(true);

    try {
      //   const salaryInfoArray = data.salaryInfo
      //     .split(",")
      //     .map((item) => item.trim());

      const jobData = {
        ...data,
        // salaryInfo: salaryInfoArray,
        createdAt: new Date().toISOString(),
        applicantsCount: 0,
      };

      console.log(data);

      setTimeout(() => {
        setIsSubmitting(false);
      }, 1000);

      //   await createJob(jobData)
      //   router.push("/jobs");
      //   router.refresh();
    } catch (error) {
      console.error("Error creating job:", error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <div className="pt-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Title*</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. Senior Frontend Developer"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Name*</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Acme Inc." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="companyLogo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Company Logo URL*</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://example.com/logo.png"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location*</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. New York, NY or Remote"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="employmentType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Employment Type*</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select employment type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {employmentTypes.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="seniorityLevel"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Seniority Level*</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select seniority level" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {seniorityLevels.map((level) => (
                          <SelectItem key={level} value={level}>
                            {level}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* <FormField
                control={form.control}
                name="salaryInfo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salary Information*</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. $80,000-$100,000, Health benefits, 401k"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Enter salary ranges and benefits, separated by commas
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              /> */}

              <FormField
                control={form.control}
                name="link"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Job Posting URL*</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="https://example.com/careers/job-posting"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="descriptionText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Job Description Text</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter the full job description with responsibilities, requirements, and benefits..."
                      className="min-h-[200px]"
                      value={field.value} // ensure it's controlled
                      onChange={field.onChange} // ensure updates are tracked
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="descriptionHtml"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Job Description*</FormLabel>
                  <ReactQuill
                    theme="snow"
                    defaultValue={field.value} // ← correct this!
                    modules={{ toolbar: toolbarOptions }}
                    className=""
                    onChange={(value) => {
                      field.onChange(value); // track with form
                      handleChange(value); // optional custom handler
                    }}
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-5 items-center mt-20 pb-10">
              <Button
                variant="outline"
                onClick={() => router.push(`/${role}/jobs`)}
              >
                Back
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit Job Listing"
                )}
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
