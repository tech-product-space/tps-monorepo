"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import Cookies from "js-cookie";

import { X, RefreshCw } from "lucide-react";

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

import { useNotification } from "@/helpers/NotificationContext";
import {
  createJob,
  getJobById,
  updateJob,
  repostJob,
} from "@/services/job/jobService";
import {
  uploadProjectFile,
  deleteProjectFile,
} from "@/services/project/projectServices";

import "react-quill-new/dist/quill.snow.css";
const ReactQuill = dynamic(() => import("react-quill-new"), { ssr: false });

const PRODUCT_SPACE_LOGO =
  "https://assets.theproductspace.in/projects/1770019301592-ps_new_logo.jpeg";

const formSchema = z.object({
  jobType: z.string().min(1),
  jobSource: z.string().min(1),
  title: z.string().min(1),
  location: z.string().min(1),
  employmentType: z.string().min(1),
  seniorityLevel: z.string().min(1),
  jobFunction: z.string().min(1),
  companyName: z.string().min(1),
  descriptionHtml: z.string().min(1),
  companyLogo: z.string(),
  status: z.string().min(1),
});

export default function EditJobs() {
  const { id } = useParams<{ id?: string }>();
  const currentUser = Cookies.get("currentRole");
  const router = useRouter();
  const { showNotification } = useNotification();
  const mediaInputRef = useRef<HTMLInputElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [isMediaUploading, setIsMediaUploading] = useState(false);
  const [jobData, setJobData] = useState<any>(null);
  const [repostOpen, setRepostOpen] = useState(false);
  const [isReposting, setIsReposting] = useState(false);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      jobType: "",
      jobSource: "",
      title: "",
      location: "",
      employmentType: "",
      seniorityLevel: "",
      jobFunction: "",
      companyName: "",
      descriptionHtml: "",
      companyLogo: "",
      status: "published",
    },
  });

  const jobSource = form.watch("jobSource");

  const getJobsData = async () => {
    if (!id) return setLoading(false);
    try {
      const data = await getJobById(id);
      form.reset(data);
      setJobData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRepost = async () => {
    if (!id) return;
    setIsReposting(true);
    try {
      await repostJob(id);
      showNotification(
        "success",
        "Reposted",
        "Job reposted — it's now published and back at the top.",
      );
      setRepostOpen(false);
      await getJobsData();
    } catch (err) {
      console.error(err);
      showNotification("error", "Failed", "Could not repost the job.");
    } finally {
      setIsReposting(false);
    }
  };

  const formatDate = (value?: string | null) => {
    if (!value) return "—";
    const date = new Date(value);
    if (isNaN(date.getTime())) return "—";
    const dd = String(date.getDate()).padStart(2, "0");
    const mm = String(date.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${date.getFullYear()}`;
  };

  const handleMediaUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsMediaUploading(true);
    const file = files[0];
    try {
      const uploaded = await uploadProjectFile(file);
      form.setValue("companyLogo", uploaded.fileUrl);
      form.trigger("companyLogo");
      showNotification("success", "Success", "Logo uploaded successfully.");
    } catch (error) {
      console.error("Error uploading logo:", error);
      showNotification("error", "Upload Failed", "Failed to upload logo.");
    } finally {
      setIsMediaUploading(false);
    }
  };

  const handleSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      console.log("Submitting job data:", values);

      if (id) {
        await updateJob(id as string, values);
        showNotification("success", "Success", "Job updated successfully.");
        router.push(`/${currentUser}/jobs`);
      } else {
        await createJob(values);
        showNotification("success", "Success", "Job created successfully.");
        router.push(`/${currentUser}/jobs`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (jobSource === "career") {
      form.setValue("jobType", "null");
      form.setValue("companyLogo", PRODUCT_SPACE_LOGO);
    }

    if (jobSource === "external") {
      form.setValue("companyLogo", "");
    }
  }, [jobSource, form]);

  useEffect(() => {
    getJobsData();
  }, [id]);

  if (loading) return <div className="p-10 text-center">Loading...</div>;

  return (
    <div className="flex flex-col h-screen">
      <div className="px-5 h-16 flex items-center border-b gap-2">
        <SidebarTrigger size="lg" />
        {id ? (
          <p className="text-lg font-semibold">Edit Job</p>
        ) : (
          <p className="text-lg font-semibold">Add Job</p>
        )}

        {id && (
          <div className="ml-auto flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Posted: {formatDate(jobData?.postedAt)}
              {jobData?.repostCount
                ? ` · reposted ${jobData.repostCount}×`
                : ""}
            </span>
            <Button
              type="button"
              variant="outline"
              className="flex items-center gap-2"
              onClick={() => setRepostOpen(true)}
            >
              <RefreshCw className="h-4 w-4" />
              Repost
            </Button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto bg-muted">
        <div className="bg-white shadow-md">
          <div className="p-6 space-y-6">
            <h2 className="text-2xl font-bold mb-4">Job Information</h2>

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleSubmit)}
                className="space-y-6"
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { label: "Job Title", name: "title" },
                    { label: "Location", name: "location" },
                    { label: "Employment Type", name: "employmentType" },
                    { label: "Seniority Level", name: "seniorityLevel" },
                    { label: "Job Function", name: "jobFunction" },
                    { label: "Company Name", name: "companyName" },
                  ].map(({ label, name }) => (
                    <FormField
                      key={name}
                      control={form.control}
                      name={name as keyof z.infer<typeof formSchema>}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{label}</FormLabel>
                          <Input
                            {...field}
                            placeholder={`Enter ${label.toLowerCase()}`}
                          />
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}

                  <FormField
                    control={form.control}
                    name="jobSource"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Job Source</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select job type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="external">
                              External Job
                            </SelectItem>
                            <SelectItem value="career">
                              Career in Product Space
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {jobSource === "external" && (
                    <FormField
                      control={form.control}
                      name="jobType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Job Type</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            value={field.value}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select job type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="product">Product</SelectItem>
                              <SelectItem value="engineering">
                                Engineering
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}

                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="published">
                              Published (visible on site)
                            </SelectItem>
                            <SelectItem value="draft">
                              Draft (hidden)
                            </SelectItem>
                            <SelectItem value="closed">
                              Closed (filled / stopped)
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {jobSource === "external" && (
                  <FormField
                    control={form.control}
                    name="companyLogo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Company Logo URL</FormLabel>

                        <div className="relative w-full">
                          <Input
                            readOnly
                            value={field.value}
                            placeholder="Click to upload logo"
                            onClick={() => mediaInputRef.current?.click()}
                            className="cursor-pointer pr-10"
                          />

                          {field.value && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="absolute right-1 top-1/2 -translate-y-1/2"
                              onClick={async () => {
                                try {
                                  const fileName = field.value.split("/").pop();
                                  if (fileName) {
                                    await deleteProjectFile(fileName);
                                    field.onChange("");
                                    form.trigger("companyLogo");
                                  }
                                } catch (err) {
                                  showNotification(
                                    "error",
                                    "Delete Failed",
                                    "Could not delete the logo.",
                                  );
                                }
                              }}
                            >
                              <X className="w-4 h-4 text-red-500" />
                            </Button>
                          )}

                          <input
                            type="file"
                            onChange={(e) => handleMediaUpload(e.target.files)}
                            className="hidden"
                            ref={mediaInputRef}
                            accept=".jpeg,.jpg,.png"
                          />
                        </div>

                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="descriptionHtml"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Job Description</FormLabel>
                      <div className="border rounded-md overflow-hidden">
                        <ReactQuill
                          theme="snow"
                          value={field.value}
                          onChange={field.onChange}
                          modules={{
                            toolbar: [
                              ["bold", "italic", "underline"],
                              [{ list: "ordered" }, { list: "bullet" }],
                              ["link", "clean"],
                            ],
                          }}
                        />
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-4 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    className="w-1/2"
                    onClick={() => router.push(`/${currentUser}/jobs`)}
                  >
                    Back
                  </Button>
                  <Button type="submit" className="w-1/2">
                    {id ? "Save" : "Submit"}
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </div>

      {/* Repost confirmation */}
      <AlertDialog open={repostOpen} onOpenChange={setRepostOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Repost this job?</AlertDialogTitle>
            <AlertDialogDescription>
              This refreshes the posted date to today so the job moves back to
              the top of the public listings, and re-publishes it if it was
              hidden. Applications already received stay attached.
              <br />
              <br />
              Last posted: {formatDate(jobData?.postedAt)}
              {jobData?.repostCount
                ? ` · reposted ${jobData.repostCount} time(s) before`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRepost} disabled={isReposting}>
              Repost
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
