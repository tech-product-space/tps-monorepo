"use client";

import { HoverLoading } from "@/components/Common/Loading/HoverLoading";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useNotification } from "@/helpers/NotificationContext";
import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, X } from "lucide-react";
import TiptapEditor from "../../../SimpleEditor/SimpleEditor";
import {
  uploadProjectFile,
  deleteProjectFile,
  getProjectById,
  postUserProject,
} from "@/services/project/projectServices";
import Cookies from "js-cookie";

const projectFormSchema = z.object({
  projectName: z.string().min(1, { message: "Project name is required" }),
  problemStatement: z
    .string()
    .min(1, { message: "Problem statement is required" }),
  goals: z
    .string()
    .min(1, { message: "Short Description is required" })
    .max(100),
  mediaUrl: z.string().min(1, { message: "Media URL is required" }),
  description: z.string().min(1, { message: "Description is required" }),
  documentUrl: z.string().optional(),
  tag: z.string().min(1, { message: "Please select a tag" }),
  tools: z.string(),
  skills: z.string(),
  projectLink: z.string().optional(),
});

type ProjectFormValues = z.infer<typeof projectFormSchema>;

interface EditProjectPageProps {
  id?: string;
}

const uploadFileAndGetUrl = async (file: File) => {
  const uploaded = await uploadProjectFile(file);
  return uploaded.fileUrl;
};

const AddEditProject = ({ id }: EditProjectPageProps) => {
  const { showNotification } = useNotification();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isDocumentUploading, setIsDocumentUploading] = useState(false);
  const [isMediaUploading, setIsMediaUploading] = useState(false);
  const [initialData, setInitialData] = useState<Partial<ProjectFormValues>>(
    {}
  );
  const [userId, setUserId] = useState<string | null>(null);
  const currentUser = Cookies.get("currentRole");
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectFormSchema),
    defaultValues: {
      projectName: "",
      problemStatement: "",
      goals: "",
      mediaUrl: "",
      description: "",
      documentUrl: "",
      tag: "",
      tools: "",
      skills: "",
      projectLink: "",
    },
  });

  const fetchProjectData = async () => {
    if (id) {
      setIsLoading(true);
      try {
        const projectData = await getProjectById(id);
        setInitialData(projectData.data);
        setUserId(projectData.data.userId || null);
        form.reset(projectData.data);
      } catch (error) {
        console.error("Error fetching project:", error);
        showNotification(
          "error",
          "Fetch Failed",
          "Failed to fetch project data."
        );
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleMediaUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsMediaUploading(true);
    const fileArray = Array.from(files);

    try {
      const mediaUrl = await uploadFileAndGetUrl(fileArray[0]);
      form.setValue("mediaUrl", mediaUrl);
      form.trigger("mediaUrl");
      showNotification("success", "Success", "Media uploaded successfully.");
    } catch (error) {
      console.error("Error uploading media:", error);
      showNotification("error", "Upload Failed", "Failed to upload media.");
    } finally {
      setIsMediaUploading(false);
    }
  };

  const handleDocumentUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsDocumentUploading(true);
    const fileArray = Array.from(files);

    try {
      const documentUrl = await uploadFileAndGetUrl(fileArray[0]);
      form.setValue("documentUrl", documentUrl);
      form.trigger("documentUrl");
      showNotification("success", "Success", "Document uploaded successfully.");
    } catch (error) {
      console.error("Error uploading document:", error);
      showNotification("error", "Upload Failed", "Failed to upload document.");
    } finally {
      setIsDocumentUploading(false);
    }
  };

  const onSubmit = async (data: ProjectFormValues) => {
    setIsLoading(true);
    try {
      var documentUrl = "";
      if (data.documentUrl) {
        documentUrl = data.documentUrl;
      }
      const submission = { id: id!, ...data, userId, documentUrl };
      await postUserProject(submission);
      showNotification("success", "Success", "Project updated successfully.");
      router.push(`/${currentUser}/portfolios/projects`);
    } catch (error) {
      console.error("Error submitting project:", error);
      showNotification(
        "error",
        "Submit Failed",
        `Failed to ${id ? "update" : "create"} project.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    router.push(`/${currentUser}/portfolios/projects`);
  };
  
  useEffect(() => {
    fetchProjectData();
  }, [id, form, showNotification]);

  return (
    <div className="flex flex-col h-screen">
      <div className="px-5 h-16 flex justify-between items-center border-b">
        <div className="flex items-center gap-2">
          <SidebarTrigger size={"lg"} />
          {id ? (
            <h1 className="text-lg font-semibold">Edit Project</h1>
          ) : (
            <p className="text-lg font-semibold">Create New Project</p>
          )}
        </div>
      </div>

      {isLoading ? (
        <HoverLoading
          title={id ? "Loading project..." : "Creating project..."}
        />
      ) : (
        <div className="flex flex-col h-full flex-1 overflow-auto p-5 pb-10 items-center">
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-6 max-w-6xl"
            >
              <FormField
                control={form.control}
                name="projectName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project Name</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Project name"
                        {...field}
                        className="w-full h-11"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="problemStatement"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Problem Statement</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the problem you're solving"
                        className="resize-none min-h-[120px] w-full"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <FormField
                  control={form.control}
                  name="mediaUrl"
                  render={({ field }) => (
                    <FormItem className="flex flex-col w-full">
                      <FormLabel className="text-sm font-medium text-gray-700">
                        Project Thumbnail{" "}
                        <span className="text-gray-500 text-xs">
                          (JPG/PNG, max 100MB)
                        </span>
                      </FormLabel>
                      <Card className="border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors p-0">
                        <CardContent
                          className="flex flex-col items-center justify-center p-6 text-center min-h-[125px] cursor-pointer hover:bg-gray-50 rounded-2xl"
                          onClick={() => mediaInputRef.current?.click()}
                        >
                          <Upload className="h-8 w-8 text-gray-400 mb-2" />
                          <p className="text-sm text-gray-600 mb-2">
                            {isMediaUploading ? "Uploading..." : "Upload Media"}
                          </p>
                          <input
                            type="file"
                            onChange={(e) => handleMediaUpload(e.target.files)}
                            className="hidden"
                            ref={mediaInputRef}
                            accept=".jpeg,.jpg,.png"
                          />
                        </CardContent>
                      </Card>
                      {field.value && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600 truncate max-w-xs">
                            {field.value.split("/").pop()}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={async () => {
                              try {
                                await deleteProjectFile(
                                  field.value.split("/").pop() || ""
                                );
                                field.onChange("");
                              } catch (err) {
                                console.error("Delete failed", err);
                              }
                            }}
                          >
                            <X className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="documentUrl"
                  render={({ field }) => (
                    <FormItem className="flex flex-col w-full">
                      <FormLabel className="text-sm font-medium text-gray-700">
                        Upload Document{" "}
                        <span className="text-gray-500 text-xs">
                          (PDF/MP4, max 100MB)
                        </span>
                      </FormLabel>
                      <Card className="border-2 border-dashed border-gray-300 hover:border-gray-400 transition-colors p-0">
                        <CardContent
                          className="flex flex-col items-center justify-center p-6 text-center min-h-[127px] cursor-pointer hover:bg-gray-50 rounded-2xl"
                          onClick={() => documentInputRef.current?.click()}
                        >
                          <Upload className="h-8 w-8 text-gray-400 mb-2" />
                          <p className="text-sm text-gray-600 mb-2">
                            {isDocumentUploading
                              ? "Uploading..."
                              : "Upload Document"}
                          </p>
                          <input
                            type="file"
                            onChange={(e) =>
                              handleDocumentUpload(e.target.files)
                            }
                            className="hidden"
                            ref={documentInputRef}
                            accept=".pdf,.mp4"
                          />
                        </CardContent>
                      </Card>
                      {field.value && (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600 truncate max-w-xs">
                            {field.value.split("/").pop()}
                          </span>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            onClick={async () => {
                              try {
                                await deleteProjectFile(
                                  field.value?.split("/").pop() || ""
                                );
                                field.onChange("");
                              } catch (err) {
                                console.error("Delete failed", err);
                              }
                            }}
                          >
                            <X className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-6">
                <FormField
                  control={form.control}
                  name="goals"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700">
                        Short Description{" "}
                        <span className="text-gray-500 text-xs">
                          (Max char. 100)
                        </span>
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Please write a short description"
                          className="resize-none min-h-[80px] w-full"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="text-sm font-medium text-gray-700">
                        Description/Overview
                      </FormLabel>
                      <FormControl>
                        <TiptapEditor
                          placeholder="Please write a detailed description"
                          content={field.value}
                          onChange={field.onChange}
                          className="w-full"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="tag"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-gray-700">
                      Tag
                    </FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl className="w-full">
                        <SelectTrigger className="!h-11">
                          <SelectValue placeholder="Select a tag" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="PRD">PRD</SelectItem>
                        <SelectItem value="Product Improvement">
                          Product Improvement
                        </SelectItem>
                        <SelectItem value="Teardown">Teardown</SelectItem>
                        <SelectItem value="Product Design">
                          Product Design
                        </SelectItem>
                        <SelectItem value="Product Sense">
                          Product Sense
                        </SelectItem>
                        <SelectItem value="AI Capstone">AI Capstone</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="projectLink"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-sm font-medium text-gray-700">
                      Prototype Link{" "}
                      <span className="text-gray-500 text-xs">(If Any)</span>
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Project Link"
                        {...field}
                        className="w-full h-11"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="flex justify-end gap-2 pt-6">
                <Button type="button" variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={
                    isDocumentUploading || isMediaUploading || isLoading
                  }
                >
                  {id ? "Update" : "Create"} Project
                </Button>
              </div>
            </form>
          </Form>
        </div>
      )}
    </div>
  );
};

export default AddEditProject;
